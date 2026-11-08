import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRealTryLlm } from './try-ai-runtime';

afterEach(() => vi.restoreAllMocks());

describe('createRealTryLlm — cờ LLM bật mà thiếu tên model', () => {
  const base = { LITELLM_BASE_URL: 'http://litellm.local:4000', LITELLM_API_KEY: 'virtual-key' };

  it('bước đó TẮT (không gọi model mặc định) và ghi log nêu biến thiếu', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const llm = createRealTryLlm({
      ...base,
      CLASSIFY_LLM_ENABLED: 'true',
      CLASSIFY_LLM_MODEL: 'cf-classify',
      DRAFT_LLM_ENABLED: 'true',
    });
    expect(llm.extractor).toBeDefined();
    expect(llm.drafter).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toContain('llm_config_invalid');
    expect(line).toContain('DRAFT_LLM_MODEL');
    expect(line).not.toContain('virtual-key');
  });

  it('cấu hình đủ → không log lỗi', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createRealTryLlm({
      ...base,
      CLASSIFY_LLM_ENABLED: 'true',
      CLASSIFY_LLM_MODEL: 'cf-classify',
      DRAFT_LLM_ENABLED: 'true',
      DRAFT_LLM_MODEL: 'cf-draft',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
