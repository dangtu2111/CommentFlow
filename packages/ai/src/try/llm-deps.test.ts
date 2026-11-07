import { describe, expect, it, vi } from 'vitest';
import { createLlmDepsFromEnv } from './llm-deps';

const db = { withWorkspace: vi.fn() };
const base = { LITELLM_BASE_URL: 'http://litellm.local:4000', LITELLM_API_KEY: 'virtual-key' };

describe('createLlmDepsFromEnv — dùng chung Thử AI (web) và pipeline (worker)', () => {
  it('mặc định TẮT: không cờ → không bước nào dùng LLM', () => {
    expect(createLlmDepsFromEnv({ env: {}, db })).toEqual({});
    expect(createLlmDepsFromEnv({ env: base, db })).toEqual({});
  });

  it('bật cờ nhưng thiếu URL/khóa → rỗng, không gọi mạng', () => {
    const fetchImpl = vi.fn();
    const env = { CLASSIFY_LLM_ENABLED: 'true', DRAFT_LLM_ENABLED: 'true' };
    expect(createLlmDepsFromEnv({ env, db, fetchImpl })).toEqual({});
    expect(
      createLlmDepsFromEnv({ env: { ...env, LITELLM_BASE_URL: base.LITELLM_BASE_URL }, db }),
    ).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('chỉ bước nào bật cờ mới có bản LLM; "1" không bật; rewriter độc lập', () => {
    const onlyDraft = createLlmDepsFromEnv({ env: { ...base, DRAFT_LLM_ENABLED: 'true' }, db });
    expect(onlyDraft.drafter).toBeDefined();
    expect(onlyDraft.extractor).toBeUndefined();
    const onlyClassify = createLlmDepsFromEnv({
      env: { ...base, CLASSIFY_LLM_ENABLED: 'true' },
      db,
    });
    expect(onlyClassify.extractor).toBeDefined();
    expect(onlyClassify.drafter).toBeUndefined();
    expect(createLlmDepsFromEnv({ env: { ...base, DRAFT_LLM_ENABLED: '1' }, db })).toEqual({});
    const rewrite = createLlmDepsFromEnv({ env: { ...base, REWRITE_LLM_ENABLED: 'true' }, db });
    expect(rewrite.rewriter).toBeDefined();
    expect(rewrite.extractor).toBeUndefined();
  });

  it('lỗi mạng khi gọi → ném lỗi không lộ khóa; cảnh báo ghi chỉ siêu dữ liệu (không nội dung)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom sk-secret'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const llm = createLlmDepsFromEnv({
      env: { ...base, CLASSIFY_LLM_ENABLED: 'true', CLASSIFY_LLM_MODEL: 'cand-claude-haiku' },
      db,
      fetchImpl,
    });
    const error = await llm.extractor
      ?.extract({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        text: 'giá bao nhiêu' as never,
        lang: 'vi',
      } as never)
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain('sk-secret');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'http://litellm.local:4000/v1/chat/completions',
    );
    spy.mockRestore();
  });
});
