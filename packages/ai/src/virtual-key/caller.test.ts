import type { MaskedText } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { createCostGatedLlmClient, createMemoryCostLedger } from '../cost-gate';
import type { LlmCallInput, LlmCallResult } from '../llm-client';
import { createMockKeyAdmin } from './admin';
import { createVirtualKeyLlmCaller } from './caller';
import { createVirtualKeyResolver } from './resolver';
import { createMemoryKeyStore } from './store';

const WS_A = '0b6f2a3e-5d41-4c8e-9a10-7f3d2e1c4b5a';
const WS_B = '7c1d9e22-3b54-4f6a-8d70-1a2b3c4d5e6f';

const input = (workspaceId: string): LlmCallInput => ({
  workspaceId,
  step: 'draft',
  model: 'mock-llm',
  promptVersion: 'v1',
  messages: [{ role: 'user', content: 'xin chào' as MaskedText }],
});

const result: LlmCallResult = {
  text: 'ok',
  model: 'mock-llm',
  inputTokens: 1,
  outputTokens: 1,
  cachedTokens: 0,
  costUsd: 0,
  cacheHit: false,
  usageId: 'u1',
};

function build() {
  const ledger = createMemoryCostLedger();
  ledger.setCap(WS_A, 10);
  ledger.setCap(WS_B, 10);
  const resolver = createVirtualKeyResolver({
    enabled: true,
    sharedKey: 'shared-test',
    defaultBudgetUsd: 5,
    admin: createMockKeyAdmin(),
    store: createMemoryKeyStore(),
    ledger,
  });
  const used: string[] = [];
  const caller = createVirtualKeyLlmCaller({
    resolver,
    makeClient: (apiKey) => ({
      async call() {
        used.push(apiKey);
        return result;
      },
    }),
  });
  return { caller, used, ledger };
}

describe('FR-034 gọi LLM bằng khóa của đúng workspace', () => {
  it('mỗi workspace dùng khóa riêng, cùng workspace dùng lại cùng khóa', async () => {
    const { caller, used } = build();
    await caller.call(input(WS_A));
    await caller.call(input(WS_B));
    await caller.call(input(WS_A));
    expect(used[0]).toBe(used[2]);
    expect(used[0]).not.toBe(used[1]);
  });

  it('ghép được với cổng chi phí: bị chặn thì không cấp khóa/gọi', async () => {
    const { caller, used, ledger } = build();
    ledger.setCap(WS_A, 0);
    const gated = createCostGatedLlmClient(caller, { ledger });
    await expect(gated.call(input(WS_A))).rejects.toMatchObject({ code: 'COST_CAP_REACHED' });
    expect(used).toHaveLength(0);
    await expect(gated.call(input(WS_B))).resolves.toBeDefined();
    expect(used).toHaveLength(1);
  });

  it('không cấp được khóa → không gọi LLM', async () => {
    const used: string[] = [];
    const caller = createVirtualKeyLlmCaller({
      resolver: { resolveKey: () => Promise.reject(new Error('x')) },
      makeClient: (k) => ({
        async call() {
          used.push(k);
          return result;
        },
      }),
    });
    await expect(caller.call(input(WS_A))).rejects.toBeDefined();
    expect(used).toHaveLength(0);
  });
});
