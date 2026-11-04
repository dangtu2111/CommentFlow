import { deserializeEvent } from '@flow/connectors';
import { and, type Database, eq, type FlowDb, schema, sql } from '@flow/db';
import { type IngestJob, ingestJobSchema } from '@flow/shared';
import type { Logger } from '../logger';
import { INGEST_RETRY_LIMIT } from '../queue/definitions';
import { type BatchHandler, workspaceJob } from './run-job';

/** Sau từng này lần lỗi sự kiện thành `dead` = tổng số lần chạy tối đa của pg-boss (retryLimit + 1; docs/09 §9). */
export const MAX_INGEST_ATTEMPTS = INGEST_RETRY_LIMIT + 1;

const { webhookEvents, channels, posts, comments } = schema;

/**
 * Xử lý một sự kiện webhook bình luận (FR-021/022). Idempotent: bài và bình luận chèn `ON CONFLICT DO NOTHING`, đếm
 * chỉ tăng khi bình luận thực sự mới. Bình luận do chính Page viết KHÔNG được lưu (chống vòng lặp, nguyên tắc #5).
 * Sửa/xóa bình luận: chỉ đánh dấu xong (chờ FB-HIDE/đồng bộ trạng thái, gap `INGEST-EDIT-REMOVE`).
 */
export async function processIngestEvent(tx: Database, job: IngestJob): Promise<void> {
  const [event] = await tx
    .select({ id: webhookEvents.id, status: webhookEvents.status, payload: webhookEvents.payload })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.id, job.eventId), eq(webhookEvents.workspaceId, job.workspaceId)));
  if (!event || event.status === 'done' || event.status === 'dead') return;

  const parsed = deserializeEvent(event.payload);
  if (!parsed) {
    // Dữ liệu hỏng: thử lại vô ích → dead ngay, mã lỗi không chứa nội dung.
    await finish(tx, event.id, { status: 'dead', error: 'invalid_payload' });
    return;
  }

  const [channel] = await tx
    .select({ id: channels.id, status: channels.status })
    .from(channels)
    .where(
      and(
        eq(channels.workspaceId, job.workspaceId),
        eq(channels.platform, 'facebook'),
        eq(channels.externalId, parsed.channelExternalId),
      ),
    );

  if (channel?.status === 'connected' && parsed.kind === 'comment_created') {
    const c = parsed.comment;
    if (!c.isFromPage) {
      const [created] = await tx
        .insert(posts)
        .values({
          workspaceId: job.workspaceId,
          channelId: channel.id,
          externalId: c.postExternalId,
        })
        .onConflictDoNothing()
        .returning({ id: posts.id });
      const postId =
        created?.id ??
        (
          await tx
            .select({ id: posts.id })
            .from(posts)
            .where(and(eq(posts.channelId, channel.id), eq(posts.externalId, c.postExternalId)))
        )[0]?.id;
      if (!postId) throw new Error('post_not_found');

      const inserted = await tx
        .insert(comments)
        .values({
          workspaceId: job.workspaceId,
          channelId: channel.id,
          postId,
          externalId: c.externalId,
          parentExternalId: c.parentExternalId ?? null,
          authorExternalId: c.authorExternalId,
          authorName: c.authorName ?? null,
          text: c.text,
          createdTime: c.createdAt,
          status: 'new',
          isOwn: false,
        })
        .onConflictDoNothing()
        .returning({ id: comments.id });
      if (inserted.length > 0) {
        await tx
          .update(posts)
          .set({
            commentCount: sql`${posts.commentCount} + 1`,
            pendingCount: sql`${posts.pendingCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(posts.id, postId));
      }
    }
  }
  // Kênh đã ngắt/không còn connected, sửa/xóa, hoặc bình luận của Page: không có gì để làm → xong.
  await finish(tx, event.id, { status: 'done', error: null });
}

async function finish(
  tx: Database,
  eventId: string,
  result: { status: 'done' | 'dead'; error: string | null },
): Promise<void> {
  await tx
    .update(webhookEvents)
    .set({ status: result.status, error: result.error, processedAt: new Date() })
    .where(eq(webhookEvents.id, eventId));
}

/** Mã lỗi an toàn để lưu/log: mã Postgres hoặc tên lỗi — KHÔNG bao giờ lấy `message` (có thể chứa nội dung khách). */
export function safeErrorCode(error: unknown): string {
  const holder = error as { cause?: { code?: unknown }; code?: unknown } | null;
  const code = holder?.cause?.code ?? holder?.code;
  if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return `db_${code}`;
  return error instanceof Error ? error.name.slice(0, 60) : 'unknown';
}

async function markFailed(db: FlowDb, job: IngestJob, error: unknown): Promise<void> {
  await db.withJob(job.workspaceId, async (tx) => {
    await tx
      .update(webhookEvents)
      .set({
        attempts: sql`${webhookEvents.attempts} + 1`,
        status: sql`CASE WHEN ${webhookEvents.attempts} + 1 >= ${MAX_INGEST_ATTEMPTS} THEN 'dead' ELSE 'failed' END`,
        error: safeErrorCode(error),
      })
      .where(
        and(
          eq(webhookEvents.id, job.eventId),
          eq(webhookEvents.workspaceId, job.workspaceId),
          sql`${webhookEvents.status} NOT IN ('done', 'dead')`,
        ),
      );
  });
}

/**
 * Handler của hàng đợi `ingest`. Mỗi job một giao dịch (`withJob`); nếu lỗi, giao dịch bị hoàn tác nên việc đánh dấu
 * `failed`/`dead` + `attempts` chạy ở giao dịch RIÊNG rồi ném lại để pg-boss thử lại (backoff mũ).
 */
export function createIngestHandler(options: {
  db: FlowDb;
  logger: Pick<Logger, 'error'>;
}): BatchHandler {
  const { db, logger } = options;
  const inner = workspaceJob({
    db,
    schema: ingestJobSchema,
    handler: ({ tx, payload }) => processIngestEvent(tx, payload),
  });
  return async (jobs) => {
    for (const job of jobs) {
      try {
        await inner([job]);
      } catch (error) {
        const parsed = ingestJobSchema.safeParse(job.data);
        if (parsed.success) {
          logger.error({ eventId: parsed.data.eventId, error: safeErrorCode(error) }, 'ingest lỗi');
          await markFailed(db, parsed.data, error);
        }
        throw error;
      }
    }
  };
}
