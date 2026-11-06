import { AppError, maskPii } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import type { LlmCallInput, LlmCallResult } from '../llm-client';
import { createCostGatedLlmClient } from './gated-llm-client';
import { createMemoryCostLedger } from './ledger';

const WS = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-06T00:00:00Z');
const PRICING = { 'm-x': { inputPerMTokUsd: 1000, outputPerMTokUsd: 1000 } }; // 1 token = $0.001

const input = (over: Partial<LlmCallInput> = {}): LlmCallInput => ({
  workspaceId: WS,
  step: 'draft',
  model: 'm-x',
  promptVersion: 'draft@1',
  messages: [{ role: 'user', content: maskPii('x'.repeat(10)) }],
  maxTokens: 10, // ước tính: 10 vào + 10 ra = 20 token = $0.02
  ...over,
});

const result = (costUsd = 0.02): LlmCallResult => ({
  text: 'ok',
  model: 'm-x',
  inputTokens: 10,
  outputTokens: 10,
  cachedTokens: 0,
  costUsd,
  cacheHit: false,
  usageId: 'u1',
});

function setup(cap: number | null, spent = 0, innerImpl?: () => Promise<LlmCallResult>) {
  const ledger = createMemoryCostLedger();
  if (cap !== null) ledger.setCap(WS, cap);
  ledger.addSpend(WS, spent, NOW);
  const call = vi.fn(innerImpl ?? (async () => result()));
  const onBlock = vi.fn();
  const client = createCostGatedLlmClient(
    { call },
    { ledger, pricing: PRICING, now: () => NOW, onBlock },
  );
  return { client, call, onBlock, ledger };
}

describe('FR-071 createCostGatedLlmClient', () => {
  it('còn dư trần → gọi client thật và trả nguyên kết quả', async () => {
    const { client, call } = setup(1);
    await expect(client.call(input())).resolves.toEqual(result());
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('không có trần → gọi bình thường', async () => {
    const { client, call } = setup(null, 1000);
    await client.call(input());
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('sẽ vượt trần → KHÔNG gọi LLM, ném COST_CAP_REACHED, onBlock chỉ nhận siêu dữ liệu an toàn', async () => {
    const { client, call, onBlock } = setup(1, 0.99);
    const error = await client.call(input()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('COST_CAP_REACHED');
    expect(call).not.toHaveBeenCalled();
    expect(onBlock).toHaveBeenCalledWith({
      workspaceId: WS,
      step: 'draft',
      reason: 'would_exceed',
    });
  });

  it('đã chạm trần → cap_reached', async () => {
    const { client, onBlock } = setup(1, 1);
    await expect(client.call(input())).rejects.toMatchObject({ code: 'COST_CAP_REACHED' });
    expect(onBlock.mock.calls[0]?.[0].reason).toBe('cap_reached');
  });

  it('đọc sổ chi phí lỗi → đóng: không gọi LLM, ném INTERNAL không lộ nguyên nhân', async () => {
    const call = vi.fn();
    const client = createCostGatedLlmClient(
      { call },
      {
        ledger: {
          read: async () => {
            throw new Error('mật khẩu db: hunter2');
          },
        },
        now: () => NOW,
      },
    );
    const error = (await client.call(input()).catch((e: unknown) => e)) as AppError;
    expect(error.code).toBe('INTERNAL');
    expect(String(error.message)).not.toContain('hunter2');
    expect(call).not.toHaveBeenCalled();
  });

  it('nhả chỗ đặt khi gọi lỗi: lần sau không bị chặn oan', async () => {
    let n = 0;
    const { client, call } = setup(0.03, 0, async () => {
      n += 1;
      if (n === 1) throw new AppError('LLM_UNAVAILABLE', 'x');
      return result();
    });
    await expect(client.call(input())).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    await expect(client.call(input())).resolves.toBeDefined();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('gọi song song cùng workspace: chỉ nhận số lần vừa trần (ước tính $0.02, trần $0.05 → 2)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { client, call } = setup(0.05, 0, async () => {
      await gate;
      return result();
    });
    const attempts = Array.from({ length: 5 }, () => client.call(input()).catch((e: unknown) => e));
    await new Promise((r) => setTimeout(r, 20));
    release();
    const outcomes = await Promise.all(attempts);
    expect(call).toHaveBeenCalledTimes(2);
    expect(outcomes.filter((o) => o instanceof AppError)).toHaveLength(3);
  });

  it('mặc định (đồng hồ thật, sổ đặt chỗ riêng, giá dự phòng) vẫn chạy; trần quá nhỏ → chặn', async () => {
    const ledger = createMemoryCostLedger();
    const call = vi.fn(async () => result());
    const client = createCostGatedLlmClient({ call }, { ledger });
    await client.call(input());
    ledger.setCap(WS, 0.0001);
    await expect(client.call(input())).rejects.toMatchObject({ code: 'COST_CAP_REACHED' });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('onBlock ném lỗi vẫn trả COST_CAP_REACHED và không gọi LLM', async () => {
    const ledger = createMemoryCostLedger();
    ledger.setCap(WS, 0);
    const call = vi.fn();
    const client = createCostGatedLlmClient(
      { call },
      {
        ledger,
        now: () => NOW,
        onBlock: () => {
          throw new Error('log hỏng');
        },
      },
    );
    await expect(client.call(input())).rejects.toMatchObject({ code: 'COST_CAP_REACHED' });
    expect(call).not.toHaveBeenCalled();
  });

  it('UUID viết hoa và thường dùng chung một sổ đặt chỗ', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { client, call } = setup(0.03, 0, async () => {
      await gate;
      return result();
    });
    const first = client.call(input());
    await new Promise((r) => setTimeout(r, 10));
    await expect(client.call(input({ workspaceId: WS.toUpperCase() }))).rejects.toMatchObject({
      code: 'COST_CAP_REACHED',
    });
    release();
    await first;
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('workspace khác không bị ảnh hưởng bởi trần của workspace này', async () => {
    const { client, call } = setup(1, 1);
    await expect(client.call(input())).rejects.toBeDefined();
    const other = '00000000-0000-4000-8000-000000000002';
    await client.call(input({ workspaceId: other }));
    expect(call).toHaveBeenCalledTimes(1);
  });
});
