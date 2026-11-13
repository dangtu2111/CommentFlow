import { deserializeEvent } from '@flow/connectors';
import {
  and,
  type Database,
  eq,
  type FlowDb,
  isNull,
  lte,
  markCommentDeleted,
  ne,
  or,
  schema,
  sql,
} from '@flow/db';
import {
  type IngestJob,
  type IngestSource,
  ingestJobSchema,
  ingestSourceOf,
  type PipelineJob,
  shouldAutoRunPipeline,
} from '@flow/shared';
import type { Logger } from '../logger';
import { INGEST_RETRY_LIMIT } from '../queue/definitions';
import { type BatchHandler, workspaceJob } from './run-job';

/** Sau từng này lần lỗi sự kiện thành `dead` = tổng số lần chạy tối đa của pg-boss (retryLimit + 1; docs/09 §9). */
export const MAX_INGEST_ATTEMPTS = INGEST_RETRY_LIMIT + 1;

const { webhookEvents, channels, posts, comments } = schema;

/**
 * Xử lý một sự kiện webhook bình luận (FR-021/022). Idempotent: bài và bình luận chèn `ON CONFLICT DO NOTHING`, đếm
 * chỉ tăng khi bình luận thực sự mới. Bình luận do chính Page viết KHÔNG được lưu (chống vòng lặp, nguyên tắc #5).
 * Sửa/xóa bình luận (FR-048): cập nhật nội dung / đặt `deleted_at` (xem `applyEdit`, `applyDelete`).
 */
/** Bình luận MỚI vừa được chèn (để nơi gọi quyết định xếp job `pipeline` SAU khi giao dịch commit). */
export type IngestedComment = { id: string; ingestSource: IngestSource };

/** Bài vừa được TẠO bởi sự kiện này (chưa có nội dung — để nơi gọi điền sau khi giao dịch commit, xem `post-hydrate.ts`). */
export type CreatedPost = {
  workspaceId: string;
  channelId: string;
  channelExternalId: string;
  postId: string;
  postExternalId: string;
};

/** Bình luận MỚI của khách vừa được lưu (để nơi gọi lấy ảnh đại diện người viết SAU khi giao dịch commit, xem `comment-avatar.ts`). */
export type CreatedComment = {
  workspaceId: string;
  channelId: string;
  channelExternalId: string;
  commentId: string;
  commentExternalId: string;
};

export async function processIngestEvent(
  tx: Database,
  job: IngestJob,
  onNewPost?: (post: CreatedPost) => void,
  onNewComment?: (comment: CreatedComment) => void,
): Promise<IngestedComment[]> {
  const newComments: IngestedComment[] = [];
  const [event] = await tx
    .select({ id: webhookEvents.id, status: webhookEvents.status, payload: webhookEvents.payload })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.id, job.eventId), eq(webhookEvents.workspaceId, job.workspaceId)));
  if (!event || event.status === 'done' || event.status === 'dead') return newComments;

  const parsed = deserializeEvent(event.payload);
  if (!parsed) {
    // Dữ liệu hỏng: thử lại vô ích → dead ngay, mã lỗi không chứa nội dung.
    await finish(tx, event.id, { status: 'dead', error: 'invalid_payload' });
    return newComments;
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

  if (channel && parsed.kind === 'comment_edited') {
    await applyEdit(tx, job, channel.id, parsed.comment, parsed.occurredAt);
  } else if (channel && parsed.kind === 'comment_deleted') {
    await applyDelete(tx, job, channel.id, parsed.commentExternalId, parsed.occurredAt);
  }

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
      if (created) {
        onNewPost?.({
          workspaceId: job.workspaceId,
          channelId: channel.id,
          channelExternalId: parsed.channelExternalId,
          postId: created.id,
          postExternalId: c.postExternalId,
        });
      }
      const postId =
        created?.id ??
        (
          await tx
            .select({ id: posts.id })
            .from(posts)
            .where(and(eq(posts.channelId, channel.id), eq(posts.externalId, c.postExternalId)))
        )[0]?.id;
      if (!postId) throw new Error('post_not_found');

      const source = ingestSourceOf(event.payload);
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
          attachments: c.attachments ?? [],
          createdTime: c.createdAt,
          status: 'new',
          isOwn: false,
          // Nguồn (webhook/polling/backfill) để quyết định bình luận nào tự chạy pipeline (Q-POR1).
          ingestSource: source,
        })
        .onConflictDoNothing()
        .returning({ id: comments.id, deletedAt: comments.deletedAt });
      const born = inserted[0];
      // Dòng sinh ra ĐÃ XÓA (dấu xóa đến trước, migration 0026): đã xóa trắng bởi trigger; không tính vào số đếm bài.
      if (born?.deletedAt) await logSystemAction(tx, job.workspaceId, 'comment.deleted', born.id);
      else if (born) {
        newComments.push({ id: born.id, ingestSource: source });
        onNewComment?.({
          workspaceId: job.workspaceId,
          channelId: channel.id,
          channelExternalId: parsed.channelExternalId,
          commentId: born.id,
          commentExternalId: c.externalId,
        });
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
  // Kênh đã ngắt/không còn connected (bình luận mới), bình luận của Page, hoặc không có gì để đồng bộ → xong.
  await finish(tx, event.id, { status: 'done', error: null });
  return newComments;
}

/**
 * Khách sửa bình luận (FR-048): cập nhật `text` (và để `text_normalized` chuẩn hóa lại sau) CHỈ khi bình luận đã có,
 * không phải của Page, chưa bị xóa và nội dung thật sự đổi. Ghi `action_logs` KHÔNG kèm nội dung cũ/mới.
 * "Phân loại lại nếu chưa trả lời" chưa làm (chưa có phân loại — gap).
 */
async function applyEdit(
  tx: Database,
  job: IngestJob,
  channelId: string,
  comment: { externalId: string; text: string },
  occurredAt?: Date,
): Promise<void> {
  const updated = await tx
    .update(comments)
    .set({
      text: comment.text,
      textNormalized: null,
      ...(occurredAt ? { textSyncedAt: occurredAt } : {}),
    })
    .where(
      and(
        eq(comments.workspaceId, job.workspaceId),
        eq(comments.channelId, channelId),
        eq(comments.externalId, comment.externalId),
        eq(comments.isOwn, false),
        isNull(comments.deletedAt),
        ne(comments.text, comment.text),
        // Lần sửa CŨ đến muộn (retry) không ghi đè lần mới: chỉ áp dụng khi chưa có mốc hoặc mốc không muộn hơn sự kiện này.
        occurredAt
          ? or(isNull(comments.textSyncedAt), lte(comments.textSyncedAt, occurredAt))
          : undefined,
      ),
    )
    .returning({ id: comments.id });
  const id = updated[0]?.id;
  if (id) await logSystemAction(tx, job.workspaceId, 'comment.edited', id);
}

/** Khách xóa bình luận (FR-048): đặt `deleted_at` MỘT lần (chạy lại không đổi giờ); dòng và log được giữ. */
async function applyDelete(
  tx: Database,
  job: IngestJob,
  channelId: string,
  commentExternalId: string,
  occurredAt?: Date,
): Promise<void> {
  // Hàm DB đặt deleted_at VÀ xóa trắng nội dung/danh tính khách + bản sao trong webhook_events (FR-048, migration 0025).
  const id = await markCommentDeleted(tx, channelId, commentExternalId, occurredAt);
  if (id) await logSystemAction(tx, job.workspaceId, 'comment.deleted', id);
}

async function logSystemAction(
  tx: Database,
  workspaceId: string,
  action: string,
  commentId: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id)
    VALUES (${workspaceId}::uuid, 'system', NULL, ${action}, 'comment', ${commentId})`);
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
/** Xếp job `pipeline` cho bình luận mới (sau khi `ingest` commit). Cấu hình tắt → không xếp. */
export type IngestPipelineHook = {
  enqueue: (job: PipelineJob, startAfterSeconds: number, priority: number) => Promise<void>;
  /** Cờ DB `cf.pipeline.v2` có bật cho workspace này không (đọc theo workspace, `saas-core/flags`). */
  isEnabled: (workspaceId: string) => Promise<boolean>;
  /** Cửa sổ gộp của workspace (giây). */
  mergeWindowSeconds: (workspaceId: string) => Promise<number>;
  /**
   * Độ ưu tiên hàng đợi (FR-167): bình luận ĐẦU TIÊN của khách dưới bài (chưa có câu AI nào trong 24 giờ) cao hơn (số lớn hơn = ưu tiên
   * hơn, pg-boss). Lỗi/thiếu → 0.
   */
  priority?: (workspaceId: string, commentId: string) => Promise<number>;
};

/** Độ ưu tiên của bình luận đầu tiên của khách dưới bài. */
export const FIRST_COMMENT_PRIORITY = 10;

export function createIngestHandler(options: {
  db: FlowDb;
  logger: Pick<Logger, 'error'>;
  pipeline?: IngestPipelineHook;
  /** Điền nội dung bài mới từ nền tảng (POST-HYDRATE): gọi SAU khi giao dịch commit; hook phải tự bắt lỗi, lỗi nếu có cũng bị bỏ qua ở đây. */
  hydrate?: (post: CreatedPost) => Promise<void>;
  /** Lấy ảnh đại diện người bình luận mới (COMMENT-AUTHOR-AVATAR): gọi SAU commit, mỗi bình luận một lần; hook phải tự bắt lỗi, lỗi nếu có cũng bị bỏ qua. */
  hydrateAvatar?: (comment: CreatedComment) => Promise<void>;
}): BatchHandler {
  const { db, logger, pipeline, hydrate, hydrateAvatar } = options;
  let created: IngestedComment[] = [];
  let newPosts: CreatedPost[] = [];
  let newAvatarTargets: CreatedComment[] = [];
  const inner = workspaceJob({
    db,
    schema: ingestJobSchema,
    handler: async ({ tx, payload }) => {
      created = await processIngestEvent(
        tx,
        payload,
        (post) => newPosts.push(post),
        (comment) => newAvatarTargets.push(comment),
      );
    },
  });
  return async (jobs) => {
    for (const job of jobs) {
      created = [];
      newPosts = [];
      newAvatarTargets = [];
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
      // Điền nội dung bài mới (best-effort, sau commit): lỗi không làm hỏng ingest — bài vẫn hiện với mã ngoài như trước.
      if (hydrate) {
        for (const post of newPosts) await hydrate(post).catch(() => undefined);
      }
      // Ảnh đại diện người bình luận (best-effort, sau commit): thiếu ảnh không ảnh hưởng gì — giao diện vẫn hiện chữ cái đầu.
      if (hydrateAvatar) {
        for (const comment of newAvatarTargets) await hydrateAvatar(comment).catch(() => undefined);
      }
      // MỘT nơi quyết định xếp job: ở đây (và job quét, cùng `shouldAutoRunPipeline`). Xếp lỗi KHÔNG làm hỏng ingest: bình luận đã
      // lưu ở `new` và job quét sẽ nhặt lại.
      const parsed = ingestJobSchema.safeParse(job.data);
      if (pipeline && parsed.success) {
        await enqueueNew(pipeline, parsed.data.workspaceId, created, logger);
      }
    }
  };
}

async function enqueueNew(
  hook: IngestPipelineHook,
  workspaceId: string,
  created: readonly IngestedComment[],
  logger: Pick<Logger, 'error'>,
): Promise<void> {
  if (created.length === 0) return;
  let enabled = false;
  try {
    enabled = await hook.isEnabled(workspaceId);
  } catch (error) {
    logger.error({ error: safeErrorCode(error) }, 'ingest: không đọc được cờ pipeline');
  }
  for (const comment of created) {
    if (
      !shouldAutoRunPipeline({
        ingestSource: comment.ingestSource,
        isOwn: false,
        deleted: false,
        enabled,
      })
    ) {
      continue;
    }
    try {
      const window = await hook.mergeWindowSeconds(workspaceId);
      const priority = hook.priority ? await hook.priority(workspaceId, comment.id) : 0;
      await hook.enqueue({ workspaceId, commentId: comment.id, trigger: 'auto' }, window, priority);
    } catch (error) {
      logger.error(
        { commentId: comment.id, error: safeErrorCode(error) },
        'ingest: không xếp được job pipeline',
      );
    }
  }
}
