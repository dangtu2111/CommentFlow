import {
  type ChannelRef,
  deserializeEvent,
  eventHashOf,
  type NormalizedComment,
  PlatformError,
} from '@flow/connectors';
import { describe, expect, it, vi } from 'vitest';
import {
  backfillChannel,
  type PollableChannel,
  type PollingDeps,
  pollChannel,
  runPollingCycle,
  startPolling,
} from './polling';
import { POLL_INTERVAL_MS, POLL_OVERLAP_MS, WEBHOOK_GRACE_MS } from './polling-window';

const NOW = new Date('2026-11-06T12:00:00Z');
const WS = '11111111-1111-4111-8111-111111111111';
const WS_OTHER = '22222222-2222-4222-8222-222222222222';
const PAGE = '1000000000001';
const ref: ChannelRef = { id: 'ch-1', workspaceId: WS, platform: 'facebook', externalId: PAGE };
const channel: PollableChannel = { ref, lastPolledAt: null };

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function comment(id: string, overrides: Partial<NormalizedComment> = {}): NormalizedComment {
  return {
    externalId: id,
    postExternalId: `${PAGE}_3000000000101`,
    parentExternalId: null,
    authorExternalId: '5000000000005',
    authorName: 'Khách Mẫu',
    text: 'Còn hàng không shop?',
    createdAt: minutesAgo(60),
    isFromPage: false,
    ...overrides,
  };
}

type RecordInput = { pageExternalId: string; eventHash: string; payload: Record<string, unknown> };

function harness(
  options: {
    comments?: NormalizedComment[] | Error;
    /** Hàm ghi giả: trả danh sách dòng mới (rỗng = đã có). */
    record?: (input: RecordInput) => Array<{ eventId: string; workspaceId: string }>;
  } = {},
) {
  const recorded: RecordInput[] = [];
  const enqueued: Array<{ workspaceId: string; eventId: string }> = [];
  const updates: Array<{ channelId: string; lastPolledAt: Date }> = [];
  let seq = 0;
  const fetchComments = vi.fn(async (_c: ChannelRef, _since: Date) => {
    if (options.comments instanceof Error) throw options.comments;
    return options.comments ?? [];
  });
  const deps: PollingDeps = {
    connector: {
      fetchComments,
      mapError: (error) =>
        error instanceof PlatformError ? error : new PlatformError('UNKNOWN', { cause: error }),
    },
    lister: { list: vi.fn(async () => [channel]) },
    store: {
      recordEvent: async (raw) => {
        const input = raw as RecordInput;
        recorded.push(input);
        seq += 1;
        return options.record?.(input) ?? [{ eventId: `ev-${seq}`, workspaceId: WS }];
      },
      markPolled: async (channelRef, lastPolledAt) => {
        updates.push({ channelId: channelRef.id, lastPolledAt });
      },
    },
    enqueueIngest: async (job) => void enqueued.push(job),
    logger: { info: vi.fn(), error: vi.fn() },
    now: () => NOW,
  };
  return { deps, recorded, enqueued, updates, fetchComments };
}

describe('FR-023 pollChannel — quét bù một kênh', () => {
  it('FR-023 bình luận mới → ghi sự kiện (hash chung với webhook, nguồn polling) rồi enqueue ingest', async () => {
    const c = comment('c1');
    const { deps, recorded, enqueued } = harness({ comments: [c] });
    const result = await pollChannel(deps, channel);
    expect(result).toEqual({ fetched: 1, recorded: 1 });
    expect(recorded).toHaveLength(1);
    const event = { kind: 'comment_created' as const, channelExternalId: PAGE, comment: c };
    // Cùng hash với đường webhook → webhook đến trước/sau đều không tạo bản sao.
    expect(recorded[0]?.eventHash).toBe(eventHashOf('facebook', event));
    expect(recorded[0]?.pageExternalId).toBe(PAGE);
    expect(recorded[0]?.payload.source).toBe('polling');
    // Payload vẫn đọc lại được bằng bộ đọc của ingest.
    expect(deserializeEvent(recorded[0]?.payload)).toMatchObject({
      kind: 'comment_created',
      comment: { externalId: 'c1' },
    });
    expect(enqueued).toEqual([{ workspaceId: WS, eventId: 'ev-1' }]);
  });

  it('FR-023 bình luận đã có (hàm ghi không trả dòng mới) → không enqueue', async () => {
    const { deps, enqueued } = harness({ comments: [comment('c1')], record: () => [] });
    expect(await pollChannel(deps, channel)).toEqual({ fetched: 1, recorded: 0 });
    expect(enqueued).toEqual([]);
  });

  it('FR-023 bỏ bình luận của Page (nguyên tắc #5) và bình luận còn trong thời gian chờ webhook', async () => {
    const own = comment('own', { isFromPage: true });
    const fresh = comment('fresh', {
      createdAt: new Date(NOW.getTime() - WEBHOOK_GRACE_MS + 1),
    });
    const edge = comment('edge', { createdAt: new Date(NOW.getTime() - WEBHOOK_GRACE_MS) });
    const { deps, recorded } = harness({ comments: [own, fresh, edge] });
    const result = await pollChannel(deps, channel);
    expect(result.fetched).toBe(3);
    expect(recorded.map((r) => (r.payload.comment as { externalId: string }).externalId)).toEqual([
      'edge',
    ]);
  });

  it('FR-023 một Page ở nhiều workspace → enqueue mọi dòng mới được trả về', async () => {
    const { deps, enqueued } = harness({
      comments: [comment('c1')],
      record: () => [
        { eventId: 'a', workspaceId: WS },
        { eventId: 'b', workspaceId: WS_OTHER },
      ],
    });
    await pollChannel(deps, channel);
    expect(enqueued).toEqual([
      { workspaceId: WS, eventId: 'a' },
      { workspaceId: WS_OTHER, eventId: 'b' },
    ]);
  });

  it('FR-023 since lần đầu = 7 ngày; lần sau = last_polled_at − chồng; xong mới đặt last_polled_at = bây giờ', async () => {
    const first = harness();
    await pollChannel(first.deps, channel);
    expect(first.fetchComments.mock.calls[0]?.[1].getTime()).toBe(
      NOW.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    expect(first.updates).toEqual([{ channelId: 'ch-1', lastPolledAt: NOW }]);

    const last = minutesAgo(5);
    const next = harness();
    await pollChannel(next.deps, { ref, lastPolledAt: last });
    expect(next.fetchComments.mock.calls[0]?.[1].getTime()).toBe(last.getTime() - POLL_OVERLAP_MS);
  });

  it('FR-023 lỗi lấy bình luận → ném lại và KHÔNG đặt last_polled_at (lần sau quét lại cùng khoảng)', async () => {
    const { deps, updates } = harness({ comments: new PlatformError('RATE_LIMIT') });
    await expect(pollChannel(deps, channel)).rejects.toThrow();
    expect(updates).toEqual([]);
  });
});

describe('FR-023 runPollingCycle — một vòng cho mọi kênh', () => {
  it('FR-023 lỗi một kênh không dừng kênh khác; log chỉ có mã lỗi, không nội dung', async () => {
    const ok: PollableChannel = {
      ref: { ...ref, id: 'ch-ok', externalId: '2' },
      lastPolledAt: null,
    };
    const bad: PollableChannel = {
      ref: { ...ref, id: 'ch-bad', externalId: '3' },
      lastPolledAt: null,
    };
    const h = harness({ comments: [comment('c1')] });
    h.deps.lister = { list: async () => [bad, ok] };
    h.fetchComments.mockImplementationOnce(async () => {
      throw new Error('noi-dung-khach-bi-mat');
    });
    const summary = await runPollingCycle(h.deps);
    expect(summary).toEqual({ channels: 2, failed: 1, recorded: 1 });
    expect(h.updates.map((u) => u.channelId)).toEqual(['ch-ok']);
    const logged = JSON.stringify((h.deps.logger.error as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).toContain('UNKNOWN');
    expect(logged).not.toContain('bi-mat');
  });

  it('FR-023 lỗi khi liệt kê kênh không ném ra (worker không sập)', async () => {
    const h = harness();
    h.deps.lister = {
      list: async () => {
        throw new Error('db-down');
      },
    };
    await expect(runPollingCycle(h.deps)).resolves.toEqual({ channels: 0, failed: 1, recorded: 0 });
  });

  it('FR-023 chạy ngay rồi lặp theo chu kỳ 5 phút; hàm dừng ngắt vòng lặp', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const stop = startPolling(h.deps);
      await vi.advanceTimersByTimeAsync(0);
      expect(h.deps.lister.list).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      expect(h.deps.lister.list).toHaveBeenCalledTimes(2);
      stop();
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
      expect(h.deps.lister.list).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('FR-011 backfillChannel — lấy bình luận cũ khi kết nối', () => {
  it('FR-011 quét lùi N ngày, nguồn backfill, không chờ 5 phút, không đổi last_polled_at', async () => {
    const fresh = comment('fresh', { createdAt: minutesAgo(1) });
    const { deps, recorded, updates, fetchComments } = harness({ comments: [fresh] });
    const result = await backfillChannel(deps, ref, 30);
    expect(result).toEqual({ fetched: 1, recorded: 1 });
    expect(fetchComments.mock.calls[0]?.[1].getTime()).toBe(
      NOW.getTime() - 30 * 24 * 60 * 60 * 1000,
    );
    expect(recorded[0]?.payload.source).toBe('backfill');
    expect(updates).toEqual([]);
  });

  it('FR-011 vẫn bỏ bình luận của Page', async () => {
    const { deps, recorded } = harness({ comments: [comment('own', { isFromPage: true })] });
    await backfillChannel(deps, ref, 3);
    expect(recorded).toEqual([]);
  });

  it('FR-011 số ngày ngoài 3/7/30 bị từ chối, không gọi nền tảng', async () => {
    const { deps, fetchComments } = harness();
    await expect(backfillChannel(deps, ref, 5 as never)).rejects.toThrow('backfill_days_invalid');
    expect(fetchComments).not.toHaveBeenCalled();
  });
});
