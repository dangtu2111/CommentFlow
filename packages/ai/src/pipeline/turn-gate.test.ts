import { describe, expect, it, vi } from 'vitest';
import { createTurnGate, type TurnBegin, type TurnPorts } from './turn-gate';

const ctx = { maskedText: 'giá bao nhiêu', lang: 'vi' as const };

const ports = (over: Partial<TurnPorts> = {}): TurnPorts => ({
  emergencyStopped: async () => false,
  begin: async () => ({ outcome: 'proceed', charged: true }),
  ...over,
});

describe('PIPE-ORCHESTRATOR lát C — cổng lượt (dừng khẩn cấp → giành quyền + trừ lượt), đóng-khi-lỗi', () => {
  it('không dừng khẩn cấp, còn lượt → cho qua', async () => {
    expect(await createTurnGate(ports())(ctx)).toEqual({ allow: true });
  });

  it('dừng khẩn cấp → chặn emergency_stop và KHÔNG giành quyền/trừ lượt', async () => {
    const begin = vi.fn(async (): Promise<TurnBegin> => ({ outcome: 'proceed', charged: true }));
    const gate = createTurnGate(ports({ emergencyStopped: async () => true, begin }));
    expect(await gate(ctx)).toEqual({ allow: false, reason: 'emergency_stop' });
    expect(begin).not.toHaveBeenCalled();
  });

  it.each([
    ['quota_exhausted', 'quota_exhausted'],
    ['attempts_exhausted', 'attempts_exhausted'],
    ['not_claimable', 'already_handled'],
    ['busy', 'busy'],
  ] as const)('begin trả %s → chặn với lý do %s', async (outcome, reason) => {
    const gate = createTurnGate(ports({ begin: async () => ({ outcome }) as TurnBegin }));
    expect(await gate(ctx)).toEqual({ allow: false, reason });
  });

  it('đã trừ lượt từ lần chạy trước (charged=false ở lần này) vẫn cho qua — không trừ thêm là việc của begin', async () => {
    const gate = createTurnGate(
      ports({ begin: async () => ({ outcome: 'proceed', charged: false }) }),
    );
    expect(await gate(ctx)).toEqual({ allow: true });
  });

  it('lỗi đọc cờ dừng khẩn cấp → chặn gate_error (đóng khi lỗi, không mở), không giành quyền', async () => {
    const begin = vi.fn(async (): Promise<TurnBegin> => ({ outcome: 'proceed', charged: true }));
    const gate = createTurnGate(
      ports({
        emergencyStopped: async () => {
          throw new Error('db down');
        },
        begin,
      }),
    );
    expect(await gate(ctx)).toEqual({ allow: false, reason: 'gate_error' });
    expect(begin).not.toHaveBeenCalled();
  });

  it('lỗi ở bước giành quyền/trừ lượt → chặn gate_error', async () => {
    const gate = createTurnGate(
      ports({
        begin: async () => {
          throw new Error('consume failed');
        },
      }),
    );
    expect(await gate(ctx)).toEqual({ allow: false, reason: 'gate_error' });
  });

  it('thứ tự: kiểm dừng khẩn cấp TRƯỚC, rồi mới begin', async () => {
    const order: string[] = [];
    const gate = createTurnGate({
      emergencyStopped: async () => {
        order.push('emergency');
        return false;
      },
      begin: async () => {
        order.push('begin');
        return { outcome: 'proceed', charged: true };
      },
    });
    await gate(ctx);
    expect(order).toEqual(['emergency', 'begin']);
  });
});
