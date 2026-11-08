import {
  createDemoDrafter,
  createDemoExtractor,
  createTryQuota,
  EXTRACT_UNREADABLE_MESSAGE,
} from '@flow/ai';
import { AppError } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import { createTryAiAction } from './try-ai';
import { createTryLlmDeps } from './try-ai-llm';

const db = { withWorkspace: vi.fn() };
const base = { LITELLM_BASE_URL: 'http://litellm.local:4000', LITELLM_API_KEY: 'virtual-key' };

import { demoKnowledgeRunner, demoWiring } from './test-demo-wiring';

describe('TRY-AI-REAL lát C — cấu hình LLM (qua LiteLLM, model không cố định)', () => {
  it('mặc định TẮT: không cờ → không bước nào dùng LLM', () => {
    expect(createTryLlmDeps({ env: {}, db })).toEqual({});
    expect(createTryLlmDeps({ env: base, db })).toEqual({});
  });

  it('bật cờ nhưng thiếu URL/khóa → vẫn mẫu, không gọi mạng', () => {
    const fetchImpl = vi.fn();
    const env = { CLASSIFY_LLM_ENABLED: 'true', DRAFT_LLM_ENABLED: 'true' };
    expect(createTryLlmDeps({ env, db, fetchImpl })).toEqual({});
    expect(
      createTryLlmDeps({ env: { ...env, LITELLM_BASE_URL: base.LITELLM_BASE_URL }, db }),
    ).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('chỉ bước nào bật cờ mới có bản LLM; cờ khác "true" (ví dụ "1") không bật', () => {
    const onlyDraft = createTryLlmDeps({
      env: { ...base, DRAFT_LLM_ENABLED: 'true', DRAFT_LLM_MODEL: 'cf-draft' },
      db,
    });
    expect(onlyDraft.drafter).toBeDefined();
    expect(onlyDraft.extractor).toBeUndefined();
    const onlyClassify = createTryLlmDeps({
      env: { ...base, CLASSIFY_LLM_ENABLED: 'true', CLASSIFY_LLM_MODEL: 'cf-classify' },
      db,
    });
    expect(onlyClassify.extractor).toBeDefined();
    expect(onlyClassify.drafter).toBeUndefined();
    expect(createTryLlmDeps({ env: { ...base, DRAFT_LLM_ENABLED: '1' }, db })).toEqual({});
  });

  it('REWRITE_LLM_ENABLED=true → có bộ viết lại (rewriter) dù chưa bật extract/draft', () => {
    const llm = createTryLlmDeps({
      env: { ...base, REWRITE_LLM_ENABLED: 'true', REWRITE_LLM_MODEL: 'cf-classify' },
      db,
    });
    expect(llm.rewriter).toBeDefined();
    expect(llm.extractor).toBeUndefined();
    expect(llm.drafter).toBeUndefined();
    expect(createTryLlmDeps({ env: { ...base, REWRITE_LLM_ENABLED: '1' }, db })).toEqual({});
  });

  it('lỗi mạng khi gọi LLM → ném lỗi (ô Thử AI báo "không thử được"), không lộ khóa/nội dung', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom sk-secret'));
    const llm = createTryLlmDeps({
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
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'http://litellm.local:4000/v1/chat/completions',
    );
  });

  it('createTryAiAction dùng bản LLM được tiêm và báo đúng bước nào là LLM', async () => {
    const draft = vi.fn(async () => ({
      reply: 'Dạ shop trả lời bằng LLM.',
      lang: 'vi' as const,
      sources: [],
      needs_human: false,
      reason: '',
      claims: [],
      variants: [],
    }));
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      knowledgeRunner: demoKnowledgeRunner,
      now: () => new Date('2026-11-07T00:00:00Z'),
      llm: { extractor: createDemoExtractor(), drafter: { draft } as never },
    });
    const result = await run(
      { workspaceId: '11111111-1111-4111-8111-111111111111' },
      'ship bao nhiêu',
    );
    expect(result).toMatchObject({ ok: true, llm: { extractor: true, drafter: true } });
  });
});

describe('FR-032 đầu ra AI không đọc được → "Chuyển người", khác lỗi mạng', () => {
  const session = { workspaceId: '11111111-1111-4111-8111-111111111111' };
  const extractor = {
    async extract() {
      throw new AppError('LLM_UNAVAILABLE', EXTRACT_UNREADABLE_MESSAGE);
    },
  };

  it('JSON hỏng/sai schema → reason ai_invalid_output (có cảnh báo, không lộ nội dung)', async () => {
    const warn = vi.fn();
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      knowledgeRunner: demoKnowledgeRunner,
      now: () => new Date('2026-11-07T00:00:00Z'),
      llm: { extractor, drafter: createDemoDrafter() },
      warn,
    });
    expect(await run(session, 'ship bao nhiêu')).toEqual({
      ok: false,
      reason: 'ai_invalid_output',
    });
    expect(warn).toHaveBeenCalledWith({ event: 'try_ai_invalid_output' });
  });

  it('lỗi mạng/khóa vẫn là "unavailable" (không nhầm với đầu ra hỏng)', async () => {
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      knowledgeRunner: demoKnowledgeRunner,
      now: () => new Date('2026-11-07T00:00:00Z'),
      llm: {
        drafter: createDemoDrafter(),
        extractor: {
          async extract() {
            throw new AppError('LLM_UNAVAILABLE', 'Không kết nối được dịch vụ AI.');
          },
        },
      },
      warn: () => {},
    });
    expect(await run(session, 'ship bao nhiêu')).toEqual({ ok: false, reason: 'unavailable' });
  });
});
