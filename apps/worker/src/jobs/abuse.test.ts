import {
  type AbuseInput,
  type AbuseSink,
  type AutoPauseService,
  createInMemoryAbuseSink,
} from '@flow/ai';
import type { FlowDb } from '@flow/db';
import { isAppError } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import { createAbuseHandler } from './abuse';

const WS = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-06T12:00:00Z');
const job = (data: unknown) => ({ id: 'j1', name: 'abuse', data }) as never;

const quiet = (): AbuseInput => ({
  workspaceId: WS,
  records: [],
  sendOutcomes: [],
  cost: { spentUsd: 0, capUsd: null },
  spike: { lastHourSent: 0, avgHourlySent7d: 0 },
  removedAfterSend: { sent: 0, removed: 0 },
  scanItems: [],
});
const badOutcomes = (workspaceId: string): AbuseInput['sendOutcomes'] =>
  Array.from({ length: 6 }, (_, i) => ({
    workspaceId,
    channelId: 'ch1',
    at: new Date(NOW.getTime() - i * 1000),
    ok: false,
  }));

function setup(
  over: { input?: AbuseInput; apply?: AutoPauseService['apply']; sink?: AbuseSink } = {},
) {
  const calls: { kind: string; workspaceId: string }[] = [];
  const tx = { marker: 'tx' };
  const db = {
    withJob: async (workspaceId: string, fn: (t: unknown) => unknown) => {
      calls.push({ kind: 'job', workspaceId });
      return fn(tx);
    },
  } as unknown as FlowDb;
  const memorySink = createInMemoryAbuseSink();
  const load = vi.fn(async () => over.input ?? quiet());
  const apply: AutoPauseService['apply'] =
    over.apply ??
    (async () => ({ paused: true, newlyPaused: true, cancelled: 0, cancelFailed: false }));
  const applySpy = vi.fn(apply);
  const logger = { info: vi.fn(), error: vi.fn() };
  const handler = createAbuseHandler({
    db,
    source: { load },
    autoPause: { apply: applySpy } as unknown as AutoPauseService,
    sink: over.sink ?? memorySink,
    now: () => NOW,
    logger,
  });
  return { handler, calls, load, applySpy, sink: memorySink, logger, tx };
}

describe('FR-115 job abuse (withJob)', () => {
  it('chạy trong withJob đúng workspace và nạp số liệu bằng tx của job', async () => {
    const { handler, calls, load, tx } = setup();
    await handler([job({ workspaceId: WS })]);
    expect(calls).toEqual([{ kind: 'job', workspaceId: WS }]);
    expect(load).toHaveBeenCalledWith(tx, WS, NOW);
  });

  it('payload sai → VALIDATION_FAILED, không mở giao dịch', async () => {
    const { handler, calls } = setup();
    const err = await handler([job({ workspaceId: 'không-phải-uuid' })]).catch((e) => e);
    expect(isAppError(err) && err.code).toBe('VALIDATION_FAILED');
    expect(calls).toEqual([]);
  });

  it('bình thường: áp quyết định rỗng, không thông báo, không ghi tín hiệu', async () => {
    const { handler, applySpy, sink } = setup();
    await handler([job({ workspaceId: WS })]);
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(sink.notifications).toEqual([]);
    expect(sink.signals).toEqual([]);
  });

  it('lỗi gửi liên tiếp → apply nhận quyết định dừng; thông báo Owner/Admin đúng MỘT lần (newlyPaused)', async () => {
    const { handler, applySpy, sink } = setup({
      input: { ...quiet(), sendOutcomes: badOutcomes(WS) },
    });
    await handler([job({ workspaceId: WS })]);
    expect(applySpy.mock.calls[0]?.[0]).toBe(WS);
    expect(applySpy.mock.calls[0]?.[1].pauseWorkspace?.reason).toBe('consecutive_send_failures');
    expect(sink.notifications).toEqual([
      {
        workspaceId: WS,
        notification: { kind: 'workspace_paused', reason: 'consecutive_send_failures' },
      },
    ]);
  });

  it('đã dừng từ trước (newlyPaused=false) → KHÔNG thông báo lại', async () => {
    const { handler, sink } = setup({
      input: { ...quiet(), sendOutcomes: badOutcomes(WS) },
      apply: async () => ({ paused: true, newlyPaused: false, cancelled: 0, cancelFailed: false }),
    });
    await handler([job({ workspaceId: WS })]);
    expect(sink.notifications).toEqual([]);
  });

  it('số liệu lẫn workspace khác → không dừng nhầm', async () => {
    const { handler, applySpy } = setup({
      input: { ...quiet(), sendOutcomes: badOutcomes('ws-khac') },
    });
    await handler([job({ workspaceId: WS })]);
    expect(applySpy.mock.calls[0]?.[1].pauseWorkspace).toBeNull();
  });

  it('lỗi 368 → khóa kênh + thông báo kênh MỚI bị khóa một lần; chạy lại → không thông báo lại', async () => {
    const input: AbuseInput = {
      ...quiet(),
      sendOutcomes: [
        {
          workspaceId: WS,
          channelId: 'ch9',
          at: new Date(NOW.getTime() - 5000),
          ok: false,
          blockError: 'graph_368',
        },
      ],
    };
    const { handler, sink } = setup({ input });
    await handler([job({ workspaceId: WS })]);
    await handler([job({ workspaceId: WS })]);
    const chNotes = sink.notifications.filter((n) => n.notification.kind === 'channel_suspended');
    expect(chNotes).toHaveLength(1);
    expect(
      sink.signals.some((s) => s.signal.signal === 'graph_368' && s.signal.channelId === 'ch9'),
    ).toBe(true);
  });

  it('spike + câu bị xóa → cảnh báo Admin; từ khóa cấm → hàng xem xét với blockAutoSend', async () => {
    const input: AbuseInput = {
      ...quiet(),
      spike: { lastHourSent: 30, avgHourlySent7d: 1 },
      removedAfterSend: { sent: 20, removed: 8 },
      scanItems: [{ id: 'kb1', text: 'cá độ bóng đá' }],
    };
    const { handler, sink } = setup({ input });
    await handler([job({ workspaceId: WS })]);
    const warns = sink.notifications.flatMap((n) =>
      n.notification.kind === 'admin_warning' ? [n.notification.warning] : [],
    );
    expect(warns).toEqual(['send_spike', 'removed_after_send']);
    expect(sink.reviews).toEqual([
      {
        workspaceId: WS,
        review: { blockAutoSend: true, items: [{ id: 'kb1', keyword: 'cá độ' }] },
      },
    ]);
  });

  it('nguồn trả số liệu của workspace khác → ném, không áp hiệu ứng nào', async () => {
    const { handler, applySpy, sink } = setup({
      input: { ...quiet(), workspaceId: 'ws-khac', sendOutcomes: badOutcomes('ws-khac') },
    });
    await expect(handler([job({ workspaceId: WS })])).rejects.toThrow();
    expect(applySpy).not.toHaveBeenCalled();
    expect(sink.notifications).toEqual([]);
  });

  it('nguồn số liệu lỗi → ném để pg-boss thử lại và KHÔNG đặt cờ', async () => {
    const { handler, applySpy, load } = setup();
    load.mockRejectedValueOnce(new Error('db down'));
    await expect(handler([job({ workspaceId: WS })])).rejects.toThrow();
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('apply báo store_failed → vẫn ghi các hiệu ứng còn lại rồi ném để thử lại', async () => {
    const { handler, sink } = setup({
      input: { ...quiet(), scanItems: [{ id: 'a', text: 'lô đề' }] },
      apply: async () => ({
        paused: false,
        newlyPaused: false,
        cancelled: 0,
        cancelFailed: false,
        error: 'store_failed',
      }),
    });
    await expect(handler([job({ workspaceId: WS })])).rejects.toThrow();
    expect(sink.reviews).toHaveLength(1);
  });

  it('thông báo lỗi KHÔNG làm job lỗi (cờ đã đặt) — chỉ log mã lỗi, không log nội dung', async () => {
    const memory = createInMemoryAbuseSink();
    const sink: AbuseSink = {
      ...memory,
      notify: async () => {
        throw new Error('smtp: gửi tới a@b.com thất bại');
      },
    };
    const { handler, logger } = setup({
      input: { ...quiet(), sendOutcomes: badOutcomes(WS) },
      sink,
    });
    await expect(handler([job({ workspaceId: WS })])).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('a@b.com');
  });
});
