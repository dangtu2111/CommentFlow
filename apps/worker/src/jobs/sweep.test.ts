import { createConnectorRegistry } from '@flow/connectors';
import { describe, expect, it, vi } from 'vitest';
import { HideInFlightError, HideRetryableError } from './hide';
import { SendInFlightError, SendRetryableError } from './send';
import {
  runSweep,
  STUCK_QUEUED_SECONDS,
  STUCK_SENDING_SECONDS,
  SWEEP_BATCH_LIMIT,
  SWEEP_INTERVAL_MS,
  startSweep,
} from './sweep';

const WS = '11111111-1111-4111-8111-111111111111';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const logger = () => ({ info: vi.fn(), error: vi.fn() });

function setup(
  stuck: { reply?: string[]; hide?: string[] },
  overrides: {
    processSend?: ReturnType<typeof vi.fn>;
    processHide?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const listStuck = vi.fn(async (_db: unknown, kind: 'reply' | 'hide') =>
    (stuck[kind] ?? []).map((requestId) => ({ workspaceId: WS, requestId })),
  );
  const processSend = overrides.processSend ?? vi.fn(async () => {});
  const processHide = overrides.processHide ?? vi.fn(async () => {});
  const log = logger();
  const deps = {
    db: {} as never,
    registry: createConnectorRegistry([]),
    logger: log,
    listStuck: listStuck as never,
    processSend: processSend as never,
    processHide: processHide as never,
  };
  return { deps, listStuck, processSend, processHide, log };
}

describe('SEND-SWEEP + HIDE-SWEEP: runSweep', () => {
  it('liệt kê với ngưỡng và giới hạn đã chốt, cho cả hai loại yêu cầu', async () => {
    const { deps, listStuck } = setup({});
    await runSweep(deps);
    expect(listStuck).toHaveBeenCalledWith(deps.db, 'reply', {
      queuedAfterSeconds: STUCK_QUEUED_SECONDS,
      sendingAfterSeconds: STUCK_SENDING_SECONDS,
      limit: SWEEP_BATCH_LIMIT,
    });
    expect(listStuck).toHaveBeenCalledWith(deps.db, 'hide', expect.any(Object));
    // `sending` chỉ bị quét khi đã QUÁ hạn thuê (90 giây) — không tranh với job còn đang chạy.
    expect(STUCK_SENDING_SECONDS).toBeGreaterThan(90);
    expect(STUCK_QUEUED_SECONDS).toBeGreaterThan(STUCK_SENDING_SECONDS);
  });

  it('xử lý lại từng yêu cầu kẹt qua đúng job gửi/ẩn (job tự kiểm R1–R3/H1–H3), đếm số đã xử lý', async () => {
    const { deps, processSend, processHide } = setup({ reply: [id(1), id(2)], hide: [id(3)] });
    const result = await runSweep(deps);
    expect(result).toEqual({ send: 2, hide: 1, skipped: 0, failed: 0 });
    expect(processSend).toHaveBeenCalledTimes(2);
    expect(processSend).toHaveBeenCalledWith(
      expect.objectContaining({
        db: deps.db,
        registry: deps.registry,
        job: { workspaceId: WS, replyId: id(1) },
      }),
    );
    expect(processHide).toHaveBeenCalledWith(
      expect.objectContaining({ job: { workspaceId: WS, hideId: id(3) } }),
    );
  });

  it('yêu cầu đang bay (job khác còn thuê) → BỎ QUA, không ngủ chờ (sleep tiêm vào ném ngay)', async () => {
    let injectedSleep: ((ms: number) => Promise<void>) | undefined;
    const processSend = vi.fn(async (options: { sleep?: (ms: number) => Promise<void> }) => {
      injectedSleep = options.sleep;
      throw new SendInFlightError(60);
    });
    const processHide = vi.fn(async () => {
      throw new HideInFlightError(60);
    });
    const { deps, log } = setup({ reply: [id(1)], hide: [id(2)] }, { processSend, processHide });
    const result = await runSweep(deps);
    expect(result).toEqual({ send: 0, hide: 0, skipped: 2, failed: 0 });
    expect(log.error).not.toHaveBeenCalled();
    expect(injectedSleep).toBeTypeOf('function');
    await expect(injectedSleep?.(60_000)).rejects.toBeInstanceOf(Error);
  });

  it('lỗi một yêu cầu KHÔNG chặn yêu cầu khác và không ném ra; log chỉ có mã lỗi, không có nội dung', async () => {
    const processSend = vi
      .fn()
      .mockRejectedValueOnce(new Error('noi-dung-binh-luan-bi-mat'))
      .mockResolvedValueOnce(undefined);
    const { deps, log } = setup({ reply: [id(1), id(2)] }, { processSend });
    const result = await runSweep(deps);
    expect(result).toEqual({ send: 1, hide: 0, skipped: 0, failed: 1 });
    expect(processSend).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'reply', error: 'Error' }),
      expect.any(String),
    );
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('bi-mat');
  });

  it('lỗi tạm thời của connector (RATE_LIMIT/UNKNOWN) là việc đã xử lý, lượt quét sau thử lại — không phải lỗi', async () => {
    const processSend = vi.fn(async () => {
      throw new SendRetryableError('RATE_LIMIT');
    });
    const processHide = vi.fn(async () => {
      throw new HideRetryableError('UNKNOWN');
    });
    const { deps, log } = setup({ reply: [id(1)], hide: [id(2)] }, { processSend, processHide });
    const result = await runSweep(deps);
    expect(result).toEqual({ send: 1, hide: 1, skipped: 0, failed: 0 });
    expect(log.error).not.toHaveBeenCalled();
  });

  it('lỗi khi LIỆT KÊ một loại không ném ra và không chặn loại còn lại', async () => {
    const { deps, listStuck, processHide, log } = setup({ hide: [id(9)] });
    listStuck.mockImplementationOnce(async () => {
      throw new Error('ket-noi-bi-mat');
    });
    await expect(runSweep(deps)).resolves.toBeDefined();
    expect(processHide).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('bi-mat');
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'reply' }),
      expect.any(String),
    );
  });

  it('log thông tin khi có việc xử lý; im lặng khi không có gì kẹt', async () => {
    const quiet = setup({});
    await runSweep(quiet.deps);
    expect(quiet.log.info).not.toHaveBeenCalled();
    const busy = setup({ reply: [id(1)] });
    await runSweep(busy.deps);
    expect(busy.log.info).toHaveBeenCalledTimes(1);
  });
});

describe('SEND-SWEEP + HIDE-SWEEP: startSweep (fake timers)', () => {
  it('chạy ngay, lặp theo chu kỳ, và hàm dừng ngắt vòng lặp', async () => {
    vi.useFakeTimers();
    try {
      const { deps, listStuck } = setup({});
      const stop = startSweep(deps, 1000);
      await vi.advanceTimersByTimeAsync(0);
      expect(listStuck).toHaveBeenCalledTimes(2); // reply + hide
      await vi.advanceTimersByTimeAsync(2500);
      expect(listStuck).toHaveBeenCalledTimes(6);
      stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(listStuck).toHaveBeenCalledTimes(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it('không chạy CHỒNG: lượt trước chưa xong thì bỏ qua nhịp kế', async () => {
    vi.useFakeTimers();
    try {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const processSend = vi.fn(async () => gate);
      const { deps, listStuck } = setup({ reply: [id(1)] }, { processSend });
      const stop = startSweep(deps, 1000);
      await vi.advanceTimersByTimeAsync(3500); // 3 nhịp trong lúc lượt đầu còn treo
      expect(processSend).toHaveBeenCalledTimes(1);
      expect(listStuck).toHaveBeenCalledTimes(1);
      release();
      await vi.advanceTimersByTimeAsync(1000);
      expect(listStuck.mock.calls.length).toBeGreaterThan(1);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('chu kỳ mặc định là 60 giây', () => {
    expect(SWEEP_INTERVAL_MS).toBe(60_000);
  });
});
