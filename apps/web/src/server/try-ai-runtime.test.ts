import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./flags', () => ({
  getFlags: () => ({ isEnabled: async () => true }),
}));

import { createRealTryLlm } from './try-ai-runtime';

afterEach(() => vi.restoreAllMocks());

const WS = '11111111-1111-4111-8111-111111111111';
const base = { LITELLM_BASE_URL: 'http://litellm.local:4000', LITELLM_API_KEY: 'virtual-key' };

describe('createRealTryLlm — cờ DB bật nhưng thiếu cấu hình', () => {
  it('thiếu tên model → ready=false và log lỗi nêu biến (một lần), không lộ khóa', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const llm = createRealTryLlm({ ...base, CLASSIFY_LLM_MODEL: 'cf-classify' });
    expect(llm.drafter).toBeUndefined();
    expect(await llm.ready?.(WS)).toBe(false);
    expect(await llm.ready?.(WS)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toContain('llm_config_invalid');
    expect(line).toContain('DRAFT_LLM_MODEL');
    expect(line).not.toContain('virtual-key');
  });

  it('đủ cấu hình + cờ bật → ready=true, không log lỗi', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const llm = createRealTryLlm({
      ...base,
      CLASSIFY_LLM_MODEL: 'cf-classify',
      DRAFT_LLM_MODEL: 'cf-draft',
    });
    expect(await llm.ready?.(WS)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
