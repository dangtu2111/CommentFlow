import {
  type ChannelRef,
  eventHashOf,
  type NormalizedComment,
  type NormalizedEvent,
  type PlatformConnector,
  serializeEvent,
} from '@flow/connectors';
import {
  and,
  eq,
  type FlowDb,
  type RecordedWebhookEvent,
  type RecordWebhookEventInput,
  recordWebhookEvent,
  schema,
} from '@flow/db';
import type { IngestJob } from '@flow/shared';
import type { Logger } from '../logger';
import {
  type BackfillDays,
  backfillSince,
  isBackfillDays,
  POLL_INTERVAL_MS,
  pollSince,
  WEBHOOK_GRACE_MS,
} from './polling-window';

/**
 * Quét bù (FR-023) và lấy bình luận cũ khi kết nối (FR-011). Bình luận lấy từ nền tảng đi vào ĐÚNG đường ingest hiện có:
 * ghi `webhook_events` (hàm DEFINER, hash chung với webhook → trùng thì bỏ) rồi enqueue `ingest`. Mọi hành vi ghi vào
 * `comments`/`posts` vẫn do `ingest` làm (idempotent, bỏ bình luận của Page).
 */

/** Nguồn của sự kiện, lưu ở `payload.source` (QP3): chỉ `polling` được tính là "webhook đã rớt tin". */
export type EventSource = 'polling' | 'backfill';

export type PollableChannel = { ref: ChannelRef; lastPolledAt: Date | null };

/** Liệt kê kênh cần quét xuyên workspace. Bản DB cần hàm DEFINER (migration làn b) — gap `POLLING-CHANNEL-LIST` (QP4). */
export interface ChannelLister {
  list(): Promise<PollableChannel[]>;
}

export interface PollingStore {
  recordEvent(input: RecordWebhookEventInput): Promise<RecordedWebhookEvent[]>;
  markPolled(channel: ChannelRef, polledAt: Date): Promise<void>;
}

export type PollingDeps = {
  connector: Pick<PlatformConnector, 'fetchComments' | 'mapError'>;
  lister: ChannelLister;
  store: PollingStore;
  enqueueIngest(job: IngestJob): Promise<void>;
  logger: Pick<Logger, 'info' | 'error'>;
  now?: () => Date;
};

export type ChannelPollResult = { fetched: number; recorded: number };

/** Nối kho với DB thật: ghi sự kiện ở ngữ cảnh trần, đặt `last_polled_at` bằng `withJob` (cột hệ thống đặt được). */
export function createDbPollingStore(db: Pick<FlowDb, 'withSystem' | 'withJob'>): PollingStore {
  return {
    recordEvent: (input) => db.withSystem((tx) => recordWebhookEvent(tx, input)),
    markPolled: (channel, polledAt) =>
      db.withJob(channel.workspaceId, async (tx) => {
        await tx
          .update(schema.channels)
          .set({ lastPolledAt: polledAt })
          .where(
            and(
              eq(schema.channels.id, channel.id),
              eq(schema.channels.workspaceId, channel.workspaceId),
            ),
          );
      }),
  };
}

async function ingestComments(
  deps: PollingDeps,
  channel: ChannelRef,
  comments: NormalizedComment[],
  source: EventSource,
  now: Date,
): Promise<number> {
  const newestAllowed = now.getTime() - WEBHOOK_GRACE_MS;
  let recorded = 0;
  for (const comment of comments) {
    // Nguyên tắc #5: không đưa bình luận do chính Page viết vào đường ingest.
    if (comment.isFromPage) continue;
    // Quét bù chờ webhook: bình luận quá mới còn có thể đang trên đường tới (lần quét sau sẽ lấy, nhờ phần chồng).
    if (source === 'polling' && comment.createdAt.getTime() > newestAllowed) continue;
    const event: NormalizedEvent = {
      kind: 'comment_created',
      channelExternalId: channel.externalId,
      comment,
    };
    const rows = await deps.store.recordEvent({
      platform: 'facebook',
      pageExternalId: channel.externalId,
      eventHash: eventHashOf('facebook', event),
      payload: { ...serializeEvent(event), source },
    });
    for (const row of rows) {
      await deps.enqueueIngest({ workspaceId: row.workspaceId, eventId: row.eventId });
    }
    recorded += rows.length;
  }
  return recorded;
}

/** Quét bù MỘT kênh. Lỗi nền tảng ném ra (không đặt `last_polled_at`, lần sau quét lại đúng khoảng đó). */
export async function pollChannel(
  deps: PollingDeps,
  channel: PollableChannel,
): Promise<ChannelPollResult> {
  const now = (deps.now ?? (() => new Date()))();
  const comments = await deps.connector.fetchComments(
    channel.ref,
    pollSince(channel.lastPolledAt, now),
  );
  const recorded = await ingestComments(deps, channel.ref, comments, 'polling', now);
  await deps.store.markPolled(channel.ref, now);
  return { fetched: comments.length, recorded };
}

/** FR-011: lấy bình luận 3/7/30 ngày qua của một kênh vừa kết nối. Không đổi `last_polled_at`, không chờ webhook. */
export async function backfillChannel(
  deps: PollingDeps,
  channel: ChannelRef,
  days: BackfillDays,
): Promise<ChannelPollResult> {
  if (!isBackfillDays(days)) throw new Error('backfill_days_invalid');
  const now = (deps.now ?? (() => new Date()))();
  const comments = await deps.connector.fetchComments(channel, backfillSince(days, now));
  const recorded = await ingestComments(deps, channel, comments, 'backfill', now);
  return { fetched: comments.length, recorded };
}

export type PollingCycleSummary = { channels: number; failed: number; recorded: number };

/** Một vòng quét mọi kênh. KHÔNG ném (không làm sập worker); log chỉ có mã lỗi + id kênh, không nội dung khách. */
export async function runPollingCycle(deps: PollingDeps): Promise<PollingCycleSummary> {
  let channels: PollableChannel[];
  try {
    channels = await deps.lister.list();
  } catch (error) {
    deps.logger.error({ error: errorName(error) }, 'quét bù: không liệt kê được kênh');
    return { channels: 0, failed: 1, recorded: 0 };
  }
  const summary: PollingCycleSummary = { channels: channels.length, failed: 0, recorded: 0 };
  for (const channel of channels) {
    try {
      summary.recorded += (await pollChannel(deps, channel)).recorded;
    } catch (error) {
      summary.failed += 1;
      deps.logger.error(
        { channelId: channel.ref.id, error: deps.connector.mapError(error).code },
        'quét bù kênh lỗi',
      );
    }
  }
  if (summary.recorded > 0) {
    deps.logger.info(summary, 'quét bù đã bù bình luận bị sót');
  }
  return summary;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

/** Chạy ngay rồi định kỳ; vòng sau chỉ bắt đầu khi vòng trước xong; trả hàm dừng. */
export function startPolling(deps: PollingDeps, intervalMs = POLL_INTERVAL_MS): () => void {
  let running = false;
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      await runPollingCycle(deps);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
