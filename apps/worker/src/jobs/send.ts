import {
  type ChannelRef,
  type ConnectorRegistry,
  evaluateAction,
  isPlatformError,
  type Platform,
  type PlatformConnector,
  type PlatformError,
  textLengthOf,
} from '@flow/connectors';
import { type Database, type FlowDb, sql } from '@flow/db';
import { AppError, type SendJob, sendJobSchema } from '@flow/shared';
import type { Logger } from '../logger';
import { SEND_RETRY_LIMIT } from '../queue/definitions';
import type { BatchHandler } from './run-job';

/** Tổng số lần chạy tối đa (pg-boss: retryLimit + 1). */
export const MAX_SEND_ATTEMPTS = SEND_RETRY_LIMIT + 1;
/** Một lần gửi đang bay chưa quá khoảng này thì job khác KHÔNG được gửi lại (tránh gửi trùng khi chạy song song). */
export const SEND_LEASE_SECONDS = 90;

/** Job khác đang gửi cùng yêu cầu: ném để pg-boss thử lại sau (không phải lỗi gửi). */
export class SendInFlightError extends Error {
  constructor(readonly remainingSeconds: number) {
    super('send_in_flight');
    this.name = 'SendInFlightError';
  }
}
/** Lỗi tạm thời đáng thử lại (giới hạn tốc độ, lỗi không rõ): để pg-boss thử lại, không ghi thất bại. */
export class SendRetryableError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'SendRetryableError';
  }
}

type Row = {
  reply_id: string;
  reply_text: string;
  reply_status: string;
  attempts: number;
  requested_by: string | null;
  previous_status: string;
  lease_age_seconds: number;
  /** Từng có yêu cầu trước cho bình luận này kết thúc `UNKNOWN` (có thể đã đăng nhưng mất kết quả). */
  prior_unknown: boolean;
  comment_id: string;
  comment_status: string;
  comment_external_id: string;
  comment_external_reply_id: string | null;
  is_hidden: boolean;
  merged_into_id: string | null;
  deleted_at: Date | null;
  comment_created_time: Date | null;
  channel_id: string;
  channel_status: string;
  channel_platform: Platform;
  channel_external_id: string;
  channel_suspended: boolean;
};

type Outcome =
  | { kind: 'done' }
  | { kind: 'send'; row: Row; connector: PlatformConnector; channel: ChannelRef; resumed: boolean };

/**
 * `sendRecheck` (docs/09 §6.1) + đánh dấu `sending`: trong MỘT giao dịch khóa dòng yêu cầu. Qua hết → trả việc cần
 * làm; trượt → ghi kết quả (hủy/thất bại) và trả `done`. R4–R8 (tự gửi/giá/KB/lượt/cửa sổ tin nhắn) thuộc GĐ2+;
 * R9 (hạn mức tốc độ theo Page) là gap `SEND-RATE-LIMIT`.
 */
async function prepare(
  tx: Database,
  job: SendJob,
  registry: ConnectorRegistry,
  now: Date,
  leaseSeconds: number,
): Promise<Outcome> {
  const found = await tx.execute<Row>(sql`
    SELECT r.id AS reply_id, r.text AS reply_text, r.status AS reply_status, r.attempts, r.requested_by,
           r.previous_status, EXTRACT(EPOCH FROM (now() - r.updated_at))::float8 AS lease_age_seconds,
           EXISTS (SELECT 1 FROM cf.comment_replies p
                    WHERE p.workspace_id = r.workspace_id AND p.comment_id = r.comment_id AND p.id <> r.id
                      AND p.status = 'failed' AND p.error_code = 'UNKNOWN') AS prior_unknown,
           c.id AS comment_id, c.status AS comment_status, c.external_id AS comment_external_id,
           c.external_reply_id AS comment_external_reply_id, c.is_hidden, c.merged_into_id, c.deleted_at,
           c.created_time AS comment_created_time,
           ch.id AS channel_id, ch.status AS channel_status, ch.platform AS channel_platform,
           ch.external_id AS channel_external_id,
           (ch.send_suspended_until IS NOT NULL AND ch.send_suspended_until > now()) AS channel_suspended
      FROM cf.comment_replies r
      JOIN cf.comments c ON c.workspace_id = r.workspace_id AND c.id = r.comment_id
      JOIN cf.channels ch ON ch.workspace_id = r.workspace_id AND ch.id = r.channel_id
     WHERE r.id = ${job.replyId}::uuid AND r.workspace_id = ${job.workspaceId}::uuid
       FOR UPDATE OF r, c`);
  const row = found.rows[0];
  if (!row) return { kind: 'done' };
  if (['sent', 'cancelled', 'failed'].includes(row.reply_status)) return { kind: 'done' };

  // Đang có một lần gửi KHÁC còn trong thời hạn thuê → không gửi song song.
  if (row.reply_status === 'sending' && row.lease_age_seconds < leaseSeconds) {
    throw new SendInFlightError(Math.max(1, Math.ceil(leaseSeconds - row.lease_age_seconds)));
  }

  const finish = (status: 'cancelled' | 'failed', code: string, commentStatus: string | null) =>
    settle(tx, row, status, code, commentStatus);

  // R1: chưa được trả lời và bình luận vẫn đang `sending`.
  if (row.comment_external_reply_id !== null || row.comment_status !== 'sending') {
    await finish('cancelled', 'recheck:R1', null);
    return { kind: 'done' };
  }
  // R2: chưa ẩn/gộp/xóa trên nền tảng.
  if (row.is_hidden || row.merged_into_id !== null || row.deleted_at !== null) {
    await finish('cancelled', 'recheck:R2', row.previous_status);
    return { kind: 'done' };
  }
  // R3: kênh còn `connected` và không bị tạm khóa gửi.
  if (row.channel_status !== 'connected' || row.channel_suspended) {
    await finish('failed', 'recheck:R3', 'send_failed');
    return { kind: 'done' };
  }
  if (!registry.has(row.channel_platform)) {
    await finish('failed', 'connector_unavailable', 'send_failed');
    return { kind: 'done' };
  }
  const connector = registry.get(row.channel_platform);
  const decision = evaluateAction(connector.capabilities, 'reply', {
    referenceAt: row.comment_created_time ?? now,
    now,
    byHuman: true,
    textLength: textLengthOf(row.reply_text),
  });
  if (!decision.allowed) {
    await finish('failed', decision.reason, 'send_failed');
    return { kind: 'done' };
  }

  await tx.execute(sql`
    UPDATE cf.comment_replies SET status = 'sending', attempts = attempts + 1, updated_at = now()
     WHERE id = ${row.reply_id}::uuid`);
  return {
    kind: 'send',
    row,
    connector,
    // Lần trước có thể đã đăng nhưng mất kết quả (đang sending quá hạn thuê, hoặc yêu cầu trước kết thúc UNKNOWN).
    resumed: row.reply_status === 'sending' || row.prior_unknown,
    channel: {
      id: row.channel_id,
      workspaceId: job.workspaceId,
      platform: row.channel_platform,
      externalId: row.channel_external_id,
    },
  };
}

/** Ghi kết thúc thất bại/hủy của yêu cầu và (nếu cần) đặt trạng thái bình luận. */
async function settle(
  tx: Database,
  row: Row,
  status: 'cancelled' | 'failed',
  code: string,
  commentStatus: string | null,
  /** Sau khi gửi: chỉ ghi nếu yêu cầu vẫn `sending` đúng lần chạy này (job khác tiếp quản thì không ghi đè). */
  fenceAttempts?: number,
): Promise<boolean> {
  const updated = await tx.execute(sql`
    UPDATE cf.comment_replies SET status = ${status}, error_code = ${code}, updated_at = now()
     WHERE id = ${row.reply_id}::uuid
       AND (${fenceAttempts ?? null}::int IS NULL OR (status = 'sending' AND attempts = ${fenceAttempts ?? null}::int))
    RETURNING id`);
  if (updated.rows.length === 0) return false;
  if (commentStatus !== null) {
    await tx.execute(sql`
      UPDATE cf.comments SET status = ${commentStatus}
       WHERE id = ${row.comment_id}::uuid AND status = 'sending'`);
  }
  return true;
}

/** Lần trước có thể đã gửi thành công nhưng mất kết quả: tìm câu trả lời của chính Page cho bình luận này, cùng nội dung. */
async function findExistingReply(
  connector: PlatformConnector,
  channel: ChannelRef,
  row: Row,
): Promise<string | null> {
  const since = row.comment_created_time ?? new Date(0);
  const comments = await connector.fetchComments(channel, since);
  const wanted = row.reply_text.trim();
  const match = comments.find(
    (c) =>
      c.isFromPage && c.parentExternalId === row.comment_external_id && c.text.trim() === wanted,
  );
  return match?.externalId ?? null;
}

async function recordSent(
  tx: Database,
  row: Row,
  externalReplyId: string,
  fenceAttempts: number,
): Promise<void> {
  const updated = await tx.execute(sql`
    UPDATE cf.comment_replies
       SET status = 'sent', external_reply_id = ${externalReplyId}, sent_at = now(), error_code = NULL, updated_at = now()
     WHERE id = ${row.reply_id}::uuid AND status = 'sending' AND attempts = ${fenceAttempts}::int
    RETURNING id`);
  // Job khác đã tiếp quản/ghi kết quả (do job này chạy quá hạn thuê): KHÔNG ghi đè.
  if (updated.rows.length === 0) return;
  await tx.execute(sql`
    UPDATE cf.comments
       SET status = 'replied', external_reply_id = ${externalReplyId}, replied_by = ${row.requested_by}::uuid,
           replied_at = now(), locked_by = NULL, locked_until = NULL
     WHERE id = ${row.comment_id}::uuid AND status = 'sending'`);
  await tx.execute(sql`
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, after)
    SELECT workspace_id, 'system', NULL, 'comment.replied', 'comment', ${row.comment_id}, jsonb_build_object('reply_id', ${row.reply_id}::text, 'requested_by', ${row.requested_by}::text)
      FROM cf.comment_replies WHERE id = ${row.reply_id}::uuid`);
}

/**
 * Lỗi nền tảng → kết quả. Lỗi vĩnh viễn: ghi thất bại (+ đánh dấu kênh). Lỗi tạm thời (còn lượt thử): KHÔNG ghi thất bại,
 * trả `true` để nơi gọi ném `SendRetryableError` SAU khi giao dịch này commit:
 *  - RATE_LIMIT: chắc chắn chưa gửi → trả yêu cầu về `queued`;
 *  - UNKNOWN (có thể đã gửi nhưng mất kết quả): giữ `sending` và hết hạn thuê để lần sau KIỂM TRƯỚC khi gửi lại.
 */
async function recordFailure(
  tx: Database,
  row: Row,
  error: PlatformError,
  attemptsSoFar: number,
  leaseSeconds: number,
  definitelyNotSent: boolean,
): Promise<boolean> {
  if (
    (error.code === 'RATE_LIMIT' || error.code === 'UNKNOWN') &&
    attemptsSoFar < MAX_SEND_ATTEMPTS
  ) {
    if (error.code === 'RATE_LIMIT' && definitelyNotSent) {
      await tx.execute(sql`
        UPDATE cf.comment_replies SET status = 'queued', updated_at = now()
         WHERE id = ${row.reply_id}::uuid AND status = 'sending' AND attempts = ${attemptsSoFar}::int`);
    } else {
      await tx.execute(sql`
        UPDATE cf.comment_replies SET updated_at = now() - make_interval(secs => ${leaseSeconds + 1})
         WHERE id = ${row.reply_id}::uuid AND status = 'sending' AND attempts = ${attemptsSoFar}::int`);
    }
    return true;
  }
  // Lỗi vĩnh viễn: ghi thất bại CÓ RÀO (job khác đã tiếp quản/ghi rồi thì không đụng); chỉ đánh dấu kênh khi ghi được.
  const settled = await settle(tx, row, 'failed', error.code, 'send_failed', attemptsSoFar);
  if (!settled) return false;
  if (error.code === 'TOKEN_EXPIRED' || error.code === 'PERMISSION') {
    const channelStatus = error.code === 'TOKEN_EXPIRED' ? 'expired' : 'revoked';
    await tx.execute(sql`
      UPDATE cf.channels SET status = ${channelStatus}, updated_at = now()
       WHERE id = ${row.channel_id}::uuid AND status = 'connected'`);
  }
  return false;
}

/** Mã lỗi an toàn để ghi/log: KHÔNG lấy `message` (có thể chứa nội dung/token). */
function safeCode(error: unknown): string {
  return isPlatformError(error)
    ? error.code
    : error instanceof Error
      ? error.name.slice(0, 60)
      : 'unknown';
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function processSendJob(options: {
  db: FlowDb;
  registry: ConnectorRegistry;
  job: SendJob;
  now?: Date;
  /** Thời hạn thuê (giây); mặc định `SEND_LEASE_SECONDS`. Test có thể rút ngắn. */
  leaseSeconds?: number;
  /** Chờ khi job khác đang gửi (mặc định `setTimeout`); test tiêm bản ngắn. */
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const { db, registry, job } = options;
  const leaseSeconds = options.leaseSeconds ?? SEND_LEASE_SECONDS;
  const sleep = options.sleep ?? defaultSleep;
  const attempt = () =>
    db.withJob(job.workspaceId, (tx) =>
      prepare(tx, job, registry, options.now ?? new Date(), leaseSeconds),
    );
  let outcome: Outcome;
  try {
    outcome = await attempt();
  } catch (error) {
    if (!(error instanceof SendInFlightError)) throw error;
    // Job khác đang gửi: CHỜ hết thời hạn thuê rồi xem lại (không đốt lượt thử lại của pg-boss). Còn bay → ném (retry).
    await sleep(error.remainingSeconds * 1000);
    outcome = await attempt();
  }
  if (outcome.kind === 'done') return;
  const { row, connector, channel, resumed } = outcome;
  const attemptsSoFar = row.attempts + 1;

  let externalReplyId: string | null = null;
  let failure: PlatformError | null = null;
  // CHẮC CHẮN chưa gửi chỉ khi lỗi đến từ chính lệnh `reply` của lượt đầu (không phải tiếp quản): mọi lỗi tạm thời khác
  // (kể cả giới hạn tốc độ ở bước KIỂM) coi như "không rõ" để lần sau vẫn kiểm trước khi gửi.
  let definitelyNotSent = false;
  try {
    if (resumed) externalReplyId = await findExistingReply(connector, channel, row);
    if (externalReplyId === null) {
      definitelyNotSent = !resumed;
      externalReplyId = (await connector.reply(channel, row.comment_external_id, row.reply_text))
        .externalId;
    }
  } catch (error) {
    failure = connector.mapError(error);
  }

  const retry = await db.withJob(job.workspaceId, async (tx) => {
    if (failure) {
      return recordFailure(tx, row, failure, attemptsSoFar, leaseSeconds, definitelyNotSent);
    }
    if (externalReplyId !== null) await recordSent(tx, row, externalReplyId, attemptsSoFar);
    return false;
  });
  if (retry && failure) throw new SendRetryableError(failure.code);
}

/** Job đang ở lượt thử cuối của pg-boss (`retryCount >= retryLimit`; thiếu thông tin → không coi là cuối). */
function isLastAttempt(job: unknown): boolean {
  const meta = job as { retryCount?: unknown; retryLimit?: unknown } | null;
  return (
    typeof meta?.retryCount === 'number' &&
    typeof meta.retryLimit === 'number' &&
    meta.retryCount >= meta.retryLimit
  );
}

/**
 * Hết lượt thử mà yêu cầu chưa kết thúc: ghi `failed` để bình luận không kẹt `sending` (người dùng không tự gỡ được).
 * Đã từng gọi nền tảng (attempts > 0) → mã `UNKNOWN` (có thể đã đăng): lần "Gửi lại" sau sẽ KIỂM TRƯỚC khi gửi.
 * Trả `true` nếu đã ghi; lỗi ghi → `false` (nơi gọi ném lỗi gốc để pg-boss/quét xử lý).
 */
async function failExhausted(db: FlowDb, job: SendJob): Promise<boolean> {
  try {
    await db.withJob(job.workspaceId, async (tx) => {
      const updated = await tx.execute<{ comment_id: string }>(sql`
        UPDATE cf.comment_replies
           SET status = 'failed', updated_at = now(),
               error_code = CASE WHEN attempts > 0 THEN 'UNKNOWN' ELSE 'retries_exhausted' END
         WHERE id = ${job.replyId}::uuid AND workspace_id = ${job.workspaceId}::uuid
           AND status IN ('queued', 'sending')
        RETURNING comment_id`);
      const commentId = updated.rows[0]?.comment_id;
      if (commentId) {
        await tx.execute(sql`
          UPDATE cf.comments SET status = 'send_failed' WHERE id = ${commentId}::uuid AND status = 'sending'`);
      }
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Handler của hàng đợi `send`. Lỗi tạm thời (`SendRetryableError`, `SendInFlightError`, lỗi DB) được ném lại để
 * pg-boss thử lại (backoff mũ); mọi lỗi vĩnh viễn đã được ghi vào yêu cầu/bình luận. Log chỉ có mã, không nội dung/token.
 */
export function createSendHandler(options: {
  db: FlowDb;
  registry: ConnectorRegistry;
  logger: Pick<Logger, 'error'>;
}): BatchHandler {
  const { db, registry, logger } = options;
  return async (jobs) => {
    for (const job of jobs) {
      const result = sendJobSchema.safeParse(job.data);
      // Không đưa dữ liệu job vào thông báo (có thể chứa thông tin khách).
      if (!result.success) throw new AppError('VALIDATION_FAILED', 'Dữ liệu job không hợp lệ.');
      const parsed = result.data;
      try {
        await processSendJob({ db, registry, job: parsed });
      } catch (error) {
        logger.error({ replyId: parsed.replyId, error: safeCode(error) }, 'send lỗi');
        // Lượt thử CUỐI của pg-boss: ghi yêu cầu `failed` + bình luận `send_failed` (không để kẹt `sending`), rồi kết thúc job.
        if (isLastAttempt(job) && (await failExhausted(db, parsed))) continue;
        throw error;
      }
    }
  };
}
