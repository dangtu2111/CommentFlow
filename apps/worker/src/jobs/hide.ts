import {
  type ChannelRef,
  type ConnectorRegistry,
  evaluateAction,
  isPlatformError,
  type Platform,
  type PlatformConnector,
  type PlatformError,
} from '@flow/connectors';
import { type Database, type FlowDb, sql } from '@flow/db';
import { AppError, type HideJob, hideJobSchema } from '@flow/shared';
import type { Logger } from '../logger';
import { HIDE_RETRY_LIMIT } from '../queue/definitions';
import type { BatchHandler } from './run-job';

/** Tổng số lần chạy tối đa (pg-boss: retryLimit + 1). */
export const MAX_HIDE_ATTEMPTS = HIDE_RETRY_LIMIT + 1;
/** Một lần gọi đang bay chưa quá khoảng này thì job khác KHÔNG được gọi song song. */
export const HIDE_LEASE_SECONDS = 90;

/** Trạng thái bình luận được phép ẩn (khớp `cf.request_comment_hide`, migration 0027). */
const HIDEABLE_STATUSES = [
  'new',
  'pending_review',
  'needs_human',
  'send_failed',
  'skipped',
  'spam_suspected',
  'replied',
  'auto_replied',
] as const;

/** Job khác đang gọi cùng yêu cầu: ném để pg-boss thử lại sau (không phải lỗi ẩn). */
export class HideInFlightError extends Error {
  constructor(readonly remainingSeconds: number) {
    super('hide_in_flight');
    this.name = 'HideInFlightError';
  }
}
/** Lỗi tạm thời đáng thử lại (giới hạn tốc độ, lỗi không rõ): để pg-boss thử lại, không ghi thất bại. */
export class HideRetryableError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'HideRetryableError';
  }
}

type Row = {
  hide_id: string;
  action: 'hide' | 'unhide';
  hide_status: string;
  attempts: number;
  previous_status: string;
  requested_by: string | null;
  lease_age_seconds: number;
  comment_id: string;
  comment_status: string;
  comment_external_id: string;
  is_hidden: boolean;
  is_own: boolean;
  merged_into_id: string | null;
  deleted_at: Date | null;
  comment_created_time: Date | null;
  channel_id: string;
  channel_status: string;
  channel_platform: Platform;
  channel_external_id: string;
};

type Outcome =
  | { kind: 'done' }
  | { kind: 'call'; row: Row; connector: PlatformConnector; channel: ChannelRef };

const statusList = () =>
  sql.join(
    HIDEABLE_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  );

/**
 * Kiểm lại trước khi gọi nền tảng (tương tự `sendRecheck`, docs/09 §6.1) + đánh dấu `sending`, trong MỘT giao dịch khóa
 * dòng yêu cầu và bình luận:
 *  H1 bình luận chưa bị khách xóa/chưa gộp; H2 trạng thái còn phù hợp (đã ở trạng thái đích → xong, không gọi);
 *  H3 kênh còn `connected`; rồi `evaluateAction` theo khai báo connector.
 */
async function prepare(
  tx: Database,
  job: HideJob,
  registry: ConnectorRegistry,
  now: Date,
  leaseSeconds: number,
): Promise<Outcome> {
  const found = await tx.execute<Row>(sql`
    SELECT h.id AS hide_id, h.action, h.status AS hide_status, h.attempts, h.previous_status, h.requested_by,
           EXTRACT(EPOCH FROM (now() - h.updated_at))::float8 AS lease_age_seconds,
           c.id AS comment_id, c.status AS comment_status, c.external_id AS comment_external_id,
           c.is_hidden, c.is_own, c.merged_into_id, c.deleted_at, c.created_time AS comment_created_time,
           ch.id AS channel_id, ch.status AS channel_status, ch.platform AS channel_platform,
           ch.external_id AS channel_external_id
      FROM cf.comment_hides h
      JOIN cf.comments c ON c.workspace_id = h.workspace_id AND c.id = h.comment_id
      JOIN cf.channels ch ON ch.workspace_id = h.workspace_id AND ch.id = h.channel_id
     WHERE h.id = ${job.hideId}::uuid AND h.workspace_id = ${job.workspaceId}::uuid
       FOR UPDATE OF h, c`);
  const row = found.rows[0];
  if (!row) return { kind: 'done' };
  if (['done', 'cancelled', 'failed'].includes(row.hide_status)) return { kind: 'done' };

  // Đang có một lần gọi KHÁC còn trong thời hạn thuê → không gọi song song.
  if (row.hide_status === 'sending' && row.lease_age_seconds < leaseSeconds) {
    throw new HideInFlightError(Math.max(1, Math.ceil(leaseSeconds - row.lease_age_seconds)));
  }

  const finish = (status: 'done' | 'cancelled' | 'failed', code: string | null) =>
    settle(tx, row, status, code);

  // H1: khách đã xóa / bình luận đã gộp / bình luận do chính Page viết.
  if (row.deleted_at !== null || row.merged_into_id !== null || row.is_own) {
    await finish('cancelled', 'recheck:H1');
    return { kind: 'done' };
  }
  // H2: đã ở trạng thái đích (người khác làm trước) → xong, không gọi nền tảng; trạng thái không còn phù hợp → hủy.
  const wantHidden = row.action === 'hide';
  if (row.is_hidden === wantHidden) {
    await finish('done', null);
    return { kind: 'done' };
  }
  if (wantHidden && !(HIDEABLE_STATUSES as readonly string[]).includes(row.comment_status)) {
    await finish('cancelled', 'recheck:H2');
    return { kind: 'done' };
  }
  // H3: kênh còn `connected`.
  if (row.channel_status !== 'connected') {
    await finish('failed', 'recheck:H3');
    return { kind: 'done' };
  }
  if (!registry.has(row.channel_platform)) {
    await finish('failed', 'connector_unavailable');
    return { kind: 'done' };
  }
  const connector = registry.get(row.channel_platform);
  const decision = evaluateAction(connector.capabilities, row.action, {
    referenceAt: row.comment_created_time ?? now,
    now,
    byHuman: true,
  });
  if (!decision.allowed) {
    await finish('failed', decision.reason);
    return { kind: 'done' };
  }
  if (!connector.setHidden) {
    await finish('failed', 'ACTION_UNSUPPORTED');
    return { kind: 'done' };
  }

  await tx.execute(sql`
    UPDATE cf.comment_hides
       SET status = 'sending', attempts = attempts + 1, updated_at = now(),
           previous_status = ${wantHidden ? row.comment_status : row.previous_status}
     WHERE id = ${row.hide_id}::uuid`);
  return {
    kind: 'call',
    row,
    connector,
    channel: {
      id: row.channel_id,
      workspaceId: job.workspaceId,
      platform: row.channel_platform,
      externalId: row.channel_external_id,
    },
  };
}

/** Ghi kết thúc của yêu cầu. Sau khi gọi nền tảng: chỉ ghi nếu còn `sending` đúng lần chạy này (job khác tiếp quản thì không ghi đè). */
async function settle(
  tx: Database,
  row: Row,
  status: 'done' | 'cancelled' | 'failed',
  code: string | null,
  fenceAttempts?: number,
): Promise<boolean> {
  const updated = await tx.execute(sql`
    UPDATE cf.comment_hides
       SET status = ${status}, error_code = ${code}, updated_at = now(),
           done_at = CASE WHEN ${status} = 'done' THEN now() ELSE done_at END
     WHERE id = ${row.hide_id}::uuid
       AND (${fenceAttempts ?? null}::int IS NULL OR (status = 'sending' AND attempts = ${fenceAttempts ?? null}::int))
    RETURNING id`);
  return updated.rows.length > 0;
}

/** Nền tảng đã xác nhận: ghi yêu cầu xong (có rào) rồi MỚI đổi `is_hidden`/`status` của bình luận. */
async function recordDone(tx: Database, row: Row, fenceAttempts: number): Promise<void> {
  // Job khác đã tiếp quản/ghi kết quả (do job này chạy quá hạn thuê): KHÔNG ghi đè.
  if (!(await settle(tx, row, 'done', null, fenceAttempts))) return;
  if (row.action === 'hide') {
    await tx.execute(sql`
      UPDATE cf.comments
         SET is_hidden = true,
             status = CASE WHEN status IN (${statusList()}) THEN 'hidden' ELSE status END
       WHERE id = ${row.comment_id}::uuid`);
  } else {
    await tx.execute(sql`
      UPDATE cf.comments
         SET is_hidden = false,
             status = CASE WHEN status = 'hidden' THEN ${row.previous_status} ELSE status END
       WHERE id = ${row.comment_id}::uuid`);
  }
  await tx.execute(sql`
    INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, on_behalf_of, action, target_type, target_id, after)
    SELECT workspace_id, 'system', NULL, ${row.requested_by}::uuid,
           ${row.action === 'hide' ? 'comment.hidden' : 'comment.unhidden'}, 'comment', ${row.comment_id},
           jsonb_build_object('hide_id', ${row.hide_id}::text, 'requested_by', ${row.requested_by}::text)
      FROM cf.comment_hides WHERE id = ${row.hide_id}::uuid`);
}

/**
 * Lỗi nền tảng → kết quả. Lỗi vĩnh viễn: ghi thất bại (+ đánh dấu kênh). Lỗi tạm thời (còn lượt thử): trả yêu cầu về
 * `queued` và trả `true` để nơi gọi ném `HideRetryableError` SAU khi giao dịch commit. Ẩn/bỏ ẩn là idempotent trên nền
 * tảng nên thử lại thẳng (không cần "kiểm trước" như gửi trả lời). Bình luận KHÔNG đổi khi thất bại.
 */
async function recordFailure(
  tx: Database,
  row: Row,
  error: PlatformError,
  attemptsSoFar: number,
): Promise<boolean> {
  if (
    (error.code === 'RATE_LIMIT' || error.code === 'UNKNOWN') &&
    attemptsSoFar < MAX_HIDE_ATTEMPTS
  ) {
    await tx.execute(sql`
      UPDATE cf.comment_hides SET status = 'queued', updated_at = now()
       WHERE id = ${row.hide_id}::uuid AND status = 'sending' AND attempts = ${attemptsSoFar}::int`);
    return true;
  }
  const settled = await settle(tx, row, 'failed', error.code, attemptsSoFar);
  if (!settled) return false;
  // Chỉ TOKEN_EXPIRED đổi trạng thái kênh. PERMISSION khi ẩn có thể chỉ là một bình luận không ẩn được (ví dụ của Page):
  // KHÔNG được làm sập cả kênh (gap HIDE-PERMISSION-SCOPE: connector thật phải phân biệt "token thiếu quyền" với "từ chối từng bình luận").
  if (error.code === 'TOKEN_EXPIRED') {
    await tx.execute(sql`
      UPDATE cf.channels SET status = 'expired', updated_at = now()
       WHERE id = ${row.channel_id}::uuid AND status = 'connected'`);
  }
  return false;
}

/** Mã lỗi an toàn để ghi/log: KHÔNG lấy `message` (có thể chứa token). */
function safeCode(error: unknown): string {
  return isPlatformError(error)
    ? error.code
    : error instanceof Error
      ? error.name.slice(0, 60)
      : 'unknown';
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function processHideJob(options: {
  db: FlowDb;
  registry: ConnectorRegistry;
  job: HideJob;
  now?: Date;
  /** Thời hạn thuê (giây); mặc định `HIDE_LEASE_SECONDS`. Test có thể rút ngắn. */
  leaseSeconds?: number;
  /** Chờ khi job khác đang gọi (mặc định `setTimeout`); test tiêm bản ngắn. */
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const { db, registry, job } = options;
  const leaseSeconds = options.leaseSeconds ?? HIDE_LEASE_SECONDS;
  const sleep = options.sleep ?? defaultSleep;
  const attempt = () =>
    db.withJob(job.workspaceId, (tx) =>
      prepare(tx, job, registry, options.now ?? new Date(), leaseSeconds),
    );
  let outcome: Outcome;
  try {
    outcome = await attempt();
  } catch (error) {
    if (!(error instanceof HideInFlightError)) throw error;
    // Job khác đang gọi: CHỜ hết thời hạn thuê rồi xem lại (không đốt lượt thử lại của pg-boss). Còn bay → ném (retry).
    await sleep(error.remainingSeconds * 1000);
    outcome = await attempt();
  }
  if (outcome.kind === 'done') return;
  const { row, connector, channel } = outcome;
  const attemptsSoFar = row.attempts + 1;

  let failure: PlatformError | null = null;
  try {
    await (connector.setHidden as NonNullable<PlatformConnector['setHidden']>).call(
      connector,
      channel,
      row.comment_external_id,
      row.action === 'hide',
    );
  } catch (error) {
    failure = connector.mapError(error);
  }

  const retry = await db.withJob(job.workspaceId, async (tx) => {
    if (failure) return recordFailure(tx, row, failure, attemptsSoFar);
    await recordDone(tx, row, attemptsSoFar);
    return false;
  });
  if (retry && failure) throw new HideRetryableError(failure.code);
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
 * Hết lượt thử mà yêu cầu chưa kết thúc: ghi `failed` để không kẹt `queued`/`sending` (chặn yêu cầu mới của người dùng).
 * Đã từng gọi nền tảng (attempts > 0) → mã `UNKNOWN`. Trả `true` nếu đã ghi.
 */
async function failExhausted(
  db: FlowDb,
  job: HideJob,
  leaseSeconds: number = HIDE_LEASE_SECONDS,
): Promise<boolean> {
  try {
    await db.withJob(job.workspaceId, async (tx) => {
      await tx.execute(sql`
        UPDATE cf.comment_hides
           SET status = 'failed', updated_at = now(),
               error_code = CASE WHEN attempts > 0 THEN 'UNKNOWN' ELSE 'retries_exhausted' END
         WHERE id = ${job.hideId}::uuid AND workspace_id = ${job.workspaceId}::uuid
           AND (status = 'queued'
                OR (status = 'sending' AND updated_at < now() - make_interval(secs => ${leaseSeconds}::int)))`);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Handler của hàng đợi `hide`. Lỗi tạm thời (`HideRetryableError`, `HideInFlightError`, lỗi DB) được ném lại để pg-boss
 * thử lại (backoff mũ); mọi lỗi vĩnh viễn đã được ghi vào yêu cầu. Log chỉ có mã, không token/nội dung.
 */
export function createHideHandler(options: {
  db: FlowDb;
  registry: ConnectorRegistry;
  logger: Pick<Logger, 'error'>;
  /** Chờ khi job khác đang gọi (test tiêm bản ngắn). */
  sleep?: (ms: number) => Promise<void>;
}): BatchHandler {
  const { db, registry, logger, sleep } = options;
  return async (jobs) => {
    for (const job of jobs) {
      const result = hideJobSchema.safeParse(job.data);
      // Không đưa dữ liệu job vào thông báo.
      if (!result.success) throw new AppError('VALIDATION_FAILED', 'Dữ liệu job không hợp lệ.');
      const parsed = result.data;
      try {
        await processHideJob({ db, registry, job: parsed, ...(sleep ? { sleep } : {}) });
      } catch (error) {
        logger.error({ hideId: parsed.hideId, error: safeCode(error) }, 'hide lỗi');
        // Job khác đang gọi (còn thuê): KHÔNG ghi đè kết quả của nó.
        if (
          !(error instanceof HideInFlightError) &&
          isLastAttempt(job) &&
          (await failExhausted(db, parsed))
        )
          continue;
        throw error;
      }
    }
  };
}
