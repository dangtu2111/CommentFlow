import type { ConnectorRegistry } from '@flow/connectors';
import {
  type FlowDb,
  listStuckOutbox,
  type StuckOutboxKind,
  type StuckOutboxOptions,
  type StuckRequest,
} from '@flow/db';
import type { Logger } from '../logger';
import { HIDE_LEASE_SECONDS, HideInFlightError, HideRetryableError, processHideJob } from './hide';
import { processSendJob, SEND_LEASE_SECONDS, SendInFlightError, SendRetryableError } from './send';

/** Chu kỳ quét (60 giây). Quét lặp lại an toàn: job gửi/ẩn khóa dòng + thuê chống chạy song song. */
export const SWEEP_INTERVAL_MS = 60 * 1000;
/** `queued` quá 5 phút: pg-boss (thử lại backoff mũ) đã có đủ thời gian; còn `queued` nghĩa là job mất. */
export const STUCK_QUEUED_SECONDS = 300;
/** `sending` quá thời hạn thuê + 60 giây dung sai: job gọi nền tảng đã chết hoặc chạy lố (job quét sẽ tiếp quản có rào `attempts`). */
export const STUCK_SENDING_SECONDS = Math.max(SEND_LEASE_SECONDS, HIDE_LEASE_SECONDS) + 60;
/** Số yêu cầu tối đa mỗi loại mỗi lượt (phần còn lại để lượt sau). */
export const SWEEP_BATCH_LIMIT = 50;

/** Ném từ `sleep` tiêm vào job: yêu cầu còn bay thì bỏ qua, KHÔNG ngủ chờ (lượt quét sau xem lại). */
class SweepSkipError extends Error {
  constructor() {
    super('sweep_skip_in_flight');
    this.name = 'SweepSkipError';
  }
}
const skipInsteadOfSleep = (): Promise<void> => Promise.reject(new SweepSkipError());

export type SweepDeps = {
  db: FlowDb;
  registry: ConnectorRegistry;
  logger: Pick<Logger, 'info' | 'error'>;
  /** Tiêm được để test; mặc định đọc bằng hàm DB `cf.list_stuck_outbox` ở ngữ cảnh trần. */
  listStuck?: (
    db: FlowDb,
    kind: StuckOutboxKind,
    options: StuckOutboxOptions,
  ) => Promise<StuckRequest[]>;
  processSend?: typeof processSendJob;
  processHide?: typeof processHideJob;
};

export type SweepResult = { send: number; hide: number; skipped: number; failed: number };

const defaultListStuck: NonNullable<SweepDeps['listStuck']> = (db, kind, options) =>
  db.withSystem((tx) => listStuckOutbox(tx, kind, options));

/** Mã lỗi an toàn để log: KHÔNG lấy `message` (có thể chứa nội dung/token). */
function safeName(error: unknown): string {
  return error instanceof Error ? error.name.slice(0, 60) : 'unknown';
}

/**
 * SEND-SWEEP + HIDE-SWEEP: tìm yêu cầu gửi/ẩn kẹt (`queued` bị bỏ quên, `sending` hết thuê) và xử lý lại QUA ĐÚNG đường có
 * kiểm trước: `processSendJob` (R1–R3, `evaluateAction`, kiểm `fetchComments` trước khi gửi lại) và `processHideJob`
 * (H1–H3, `evaluateAction`). Không bao giờ gọi connector trực tiếp. Không ném ra (lỗi của một yêu cầu không chặn yêu cầu
 * khác); lỗi tạm thời để lượt sau thử lại — số lần chạy bị chặn bởi `attempts` của từng yêu cầu.
 */
export async function runSweep(deps: SweepDeps): Promise<SweepResult> {
  const { db, registry, logger } = deps;
  const listStuck = deps.listStuck ?? defaultListStuck;
  const processSend = deps.processSend ?? processSendJob;
  const processHide = deps.processHide ?? processHideJob;
  const result: SweepResult = { send: 0, hide: 0, skipped: 0, failed: 0 };
  const options: StuckOutboxOptions = {
    queuedAfterSeconds: STUCK_QUEUED_SECONDS,
    sendingAfterSeconds: STUCK_SENDING_SECONDS,
    limit: SWEEP_BATCH_LIMIT,
  };

  const sweepKind = async (
    kind: StuckOutboxKind,
    handle: (item: StuckRequest) => Promise<void>,
    retryable: new (...args: never[]) => Error,
    inFlight: new (...args: never[]) => Error,
  ): Promise<void> => {
    let items: StuckRequest[];
    try {
      items = await listStuck(db, kind, options);
    } catch (error) {
      logger.error({ kind, error: safeName(error) }, 'quét yêu cầu kẹt: liệt kê lỗi');
      return;
    }
    for (const item of items) {
      try {
        await handle(item);
        result[kind === 'reply' ? 'send' : 'hide'] += 1;
      } catch (error) {
        if (error instanceof SweepSkipError || error instanceof inFlight) {
          result.skipped += 1;
        } else if (error instanceof retryable) {
          result[kind === 'reply' ? 'send' : 'hide'] += 1;
        } else {
          result.failed += 1;
          logger.error({ kind, error: safeName(error) }, 'quét yêu cầu kẹt: xử lý lỗi');
        }
      }
    }
  };

  await sweepKind(
    'reply',
    (item) =>
      processSend({
        db,
        registry,
        job: { workspaceId: item.workspaceId, replyId: item.requestId },
        sleep: skipInsteadOfSleep,
      }),
    SendRetryableError,
    SendInFlightError,
  );
  await sweepKind(
    'hide',
    (item) =>
      processHide({
        db,
        registry,
        job: { workspaceId: item.workspaceId, hideId: item.requestId },
        sleep: skipInsteadOfSleep,
      }),
    HideRetryableError,
    HideInFlightError,
  );

  if (result.send + result.hide + result.skipped + result.failed > 0) {
    logger.info(result, 'đã quét yêu cầu gửi/ẩn kẹt');
  }
  return result;
}

/** Chạy ngay rồi định kỳ (không chạy chồng lượt); trả hàm dừng. Bộ đếm giờ `unref` để không giữ tiến trình sống. */
export function startSweep(deps: SweepDeps, intervalMs = SWEEP_INTERVAL_MS): () => void {
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await runSweep(deps);
    } catch (error) {
      deps.logger.error({ error: safeName(error) }, 'job quét yêu cầu kẹt lỗi');
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
