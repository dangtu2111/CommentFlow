import { type SendRecheckInput, type SendRecheckResult, sendRecheck } from '@flow/ai';
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
import { type Database, type FlowDb, type RawTimestamp, sql, timestampFromRow } from '@flow/db';
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
  /** Cột thời gian của `tx.execute` về dạng CHUỖI thô Postgres (không phải `Date`) — đọc qua `timestampFromRow`. */
  deleted_at: RawTimestamp;
  comment_created_time: RawTimestamp;
  channel_id: string;
  channel_status: string;
  channel_platform: Platform;
  channel_external_id: string;
  channel_suspended: boolean;
};

type Outcome =
  | { kind: 'done' }
  | { kind: 'send'; row: Row; connector: PlatformConnector; channel: ChannelRef; resumed: boolean };

/** Cột của dòng khóa cần cho `sendRecheck` (FR-110). */
export type RecheckRow = Pick<
  Row,
  | 'comment_status'
  | 'comment_external_reply_id'
  | 'is_hidden'
  | 'merged_into_id'
  | 'deleted_at'
  | 'channel_status'
  | 'channel_suspended'
>;

/**
 * Dựng đầu vào `sendRecheck` cho đường NGƯỜI GỬI (outbox `comment_replies`, FR-042): chế độ `human`, bình luận.
 * R4/R6/R7 không áp dụng cho người gửi; R5 chưa có ảnh chụp giá (bản nháp AI chưa nối — `SEND-RECHECK-WIRE`);
 * R9 nhận bộ đếm tốc độ khi có (`SEND-RATE-LIMIT`), chưa có → `null` (qua).
 */
export function recheckInputFromRow(
  row: RecheckRow,
  now: Date,
  rate: { remaining: number } | null = null,
): SendRecheckInput {
  return {
    mode: 'human',
    target: 'comment',
    now,
    comment: {
      status: row.comment_status,
      externalReplyId: row.comment_external_reply_id,
      isHidden: row.is_hidden,
      mergedIntoId: row.merged_into_id,
      deletedAt: timestampFromRow(row.deleted_at),
    },
    channel: { status: row.channel_status, sendSuspended: row.channel_suspended },
    automation: null,
    price: null,
    kb: null,
    quota: null,
    message: null,
    rate,
  };
}

export type RecheckSettlement = {
  status: 'cancelled' | 'failed';
  /** Trạng thái bình luận cần đặt (chỉ khi còn `sending`); `null` = không đụng (R1: đã có người khác đổi). */
  commentStatus: string | null;
};

/**
 * Trượt `sendRecheck` → cách ghi kết quả vào outbox (ADR 008): R1 hủy, giữ nguyên bình luận (người khác đã xử lý);
 * R2 hủy, trả bình luận về trạng thái trước; mọi điều kiện khác (kênh lỗi, giá đổi cần xác nhận, cửa sổ đóng, đầu
 * vào hỏng) → `failed` + bình luận `send_failed` để nhân viên thấy lý do `recheck:R#` và gửi lại. `defer` (R9) KHÔNG
 * phải kết quả: nơi gọi ném lỗi thử lại — hàm này không được gọi cho nó.
 */
export function settlementForRecheck(
  check: Extract<SendRecheckResult, { ok: false }>,
  previousStatus: string,
): RecheckSettlement {
  if (check.action === 'cancel') {
    return {
      status: 'cancelled',
      commentStatus: check.rule === 'recheck:R1' ? null : previousStatus,
    };
  }
  return { status: 'failed', commentStatus: 'send_failed' };
}

/**
 * `sendRecheck` (docs/09 §6.1, FR-110) + đánh dấu `sending`: trong MỘT giao dịch khóa dòng yêu cầu. Qua hết → trả việc
 * cần làm; trượt → ghi kết quả (hủy/thất bại) và trả `done`; R9 → ném lỗi thử lại (hoãn, không tính là lỗi).
 * Đường người gửi chỉ có dữ liệu R1–R3 (xem `recheckInputFromRow`).
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

  // R1–R9 (chỉ R1–R3 có dữ liệu ở đường người gửi): trượt → ghi kết quả, KHÔNG gọi nền tảng.
  const check = sendRecheck(recheckInputFromRow(row, now));
  if (!check.ok) {
    if (check.action === 'defer') throw new SendRetryableError(check.rule);
    const settlement = settlementForRecheck(check, row.previous_status);
    await finish(settlement.status, check.rule, settlement.commentStatus);
    return { kind: 'done' };
  }
  if (!registry.has(row.channel_platform)) {
    await finish('failed', 'connector_unavailable', 'send_failed');
    return { kind: 'done' };
  }
  const connector = registry.get(row.channel_platform);
  const decision = evaluateAction(connector.capabilities, 'reply', {
    referenceAt: timestampFromRow(row.comment_created_time) ?? now,
    now,
    byHuman: true,
    textLength: textLengthOf(row.reply_text),
  });
  if (!decision.allowed) {
    await finish('failed', decision.reason, 'send_failed');
    return { kind: 'done' };
  }

  // Trần số lần gọi nền tảng (job quét/lượt chạy lại không được thử vô hạn): đã đủ lượt → UNKNOWN (có thể đã đăng), không gọi.
  if (row.attempts >= MAX_SEND_ATTEMPTS) {
    await finish('failed', 'UNKNOWN', 'send_failed');
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

/**
 * Lần trước có thể đã gửi thành công nhưng mất kết quả: tìm câu trả lời của chính Page cho bình luận này, cùng nội dung.
 * Đọc theo bình luận CHA (`fetchReplies`, ADR 010 §3): connector thật không quét cả kênh (`fetchComments` ném `UNKNOWN`).
 * Connector không có `fetchReplies` (connector giả) dùng `fetchComments` như trước. Lỗi truyền ra để nơi gọi ánh xạ.
 */
export async function findExistingReply(
  connector: PlatformConnector,
  channel: ChannelRef,
  row: Pick<Row, 'comment_external_id' | 'reply_text' | 'comment_created_time'>,
): Promise<string | null> {
  const comments = connector.fetchReplies
    ? await connector.fetchReplies(channel, row.comment_external_id)
    : await connector.fetchComments(
        channel,
        timestampFromRow(row.comment_created_time) ?? new Date(0),
      );
  const wanted = row.reply_text.trim();
  const match = comments.find(
    (c) =>
      c.isFromPage && c.parentExternalId === row.comment_external_id && c.text.trim() === wanted,
  );
  return match?.externalId ?? null;
}

/**
 * Meta chặn gửi (mã 368 → `BLOCKED`): hiện CHỈ ghi nhận qua hook (log id, không nội dung/token). Ghi `send_suspended_until`
 * cần hàm Admin/DEFINER → gap `SEND-SUSPEND-ADMIN`. Hook lỗi không được làm hỏng việc ghi kết quả.
 */
export function notifyBlocked(
  onBlocked: ((event: { channelId: string; replyId: string }) => void) | undefined,
  code: string,
  event: { channelId: string; replyId: string },
): void {
  if (code !== 'BLOCKED' || !onBlocked) return;
  try {
    onBlocked(event);
  } catch {
    // log không được làm hỏng luồng gửi
  }
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
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, on_behalf_of, action, target_type, target_id, after)
    SELECT workspace_id, 'system', NULL, ${row.requested_by}::uuid, 'comment.replied', 'comment', ${row.comment_id}, jsonb_build_object('reply_id', ${row.reply_id}::text, 'requested_by', ${row.requested_by}::text)
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
  // Lượt tiếp quản (lần trước có thể đã đăng) hết lượt vì giới hạn tốc độ ở bước KIỂM: ghi `UNKNOWN` để "Gửi lại" sau vẫn
  // kiểm trước, không đăng trùng (verifier-security).
  const code = error.code === 'RATE_LIMIT' && !definitelyNotSent ? 'UNKNOWN' : error.code;
  const settled = await settle(tx, row, 'failed', code, 'send_failed', attemptsSoFar);
  if (!settled) return false;
  // Chỉ TOKEN_EXPIRED (token của cả kênh hỏng) đổi trạng thái kênh. PERMISSION ở lệnh gửi MỘT bình luận có thể là từ chối
  // theo đối tượng (bình luận không trả lời được), không đủ để kết luận cả kênh bị thu hồi: ghi `failed` mã PERMISSION.
  if (error.code === 'TOKEN_EXPIRED') {
    await tx.execute(sql`
      UPDATE cf.channels SET status = 'expired', updated_at = now()
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
  /** Gọi khi nền tảng chặn gửi (BLOCKED/368); mặc định không làm gì. */
  onBlocked?: (event: { channelId: string; replyId: string }) => void;
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
  if (failure) {
    notifyBlocked(options.onBlocked, failure.code, {
      channelId: row.channel_id,
      replyId: row.reply_id,
    });
  }
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
  logger: Pick<Logger, 'error'> & Partial<Pick<Logger, 'warn'>>;
}): BatchHandler {
  const { db, registry, logger } = options;
  return async (jobs) => {
    for (const job of jobs) {
      const result = sendJobSchema.safeParse(job.data);
      // Không đưa dữ liệu job vào thông báo (có thể chứa thông tin khách).
      if (!result.success) throw new AppError('VALIDATION_FAILED', 'Dữ liệu job không hợp lệ.');
      const parsed = result.data;
      try {
        await processSendJob({
          db,
          registry,
          job: parsed,
          onBlocked: (event) => logger.warn?.(event, 'send bị nền tảng chặn (BLOCKED)'),
        });
      } catch (error) {
        logger.error({ replyId: parsed.replyId, error: safeCode(error) }, 'send lỗi');
        // Lượt thử CUỐI của pg-boss: ghi yêu cầu `failed` + bình luận `send_failed` (không để kẹt `sending`), rồi kết thúc job.
        if (isLastAttempt(job) && (await failExhausted(db, parsed))) continue;
        throw error;
      }
    }
  };
}
