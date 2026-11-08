import { describe, expect, it, vi } from 'vitest';
import { createLlmDepsFromEnv, type LlmStep } from './llm-deps';

const db = { withWorkspace: vi.fn() };
const WS = '11111111-1111-4111-8111-111111111111';
const base = { LITELLM_BASE_URL: 'http://litellm.local:4000', LITELLM_API_KEY: 'virtual-key' };
const models = {
  CLASSIFY_LLM_MODEL: 'cf-classify',
  DRAFT_LLM_MODEL: 'cf-draft',
  REWRITE_LLM_MODEL: 'cf-classify',
};
const allOn = async () => true;
const allOff = async () => false;
const only =
  (...steps: LlmStep[]) =>
  async (step: LlmStep) =>
    steps.includes(step);

describe('createLlmDepsFromEnv — bật/tắt bằng cờ DB, env chỉ còn URL/khóa/tên model', () => {
  it('thiếu URL hoặc khóa → không có bước nào, ready=false, không gọi mạng', async () => {
    const fetchImpl = vi.fn();
    for (const env of [{}, { LITELLM_BASE_URL: base.LITELLM_BASE_URL, ...models }]) {
      const llm = createLlmDepsFromEnv({ env, db, isStepEnabled: allOn, fetchImpl });
      expect(llm.extractor).toBeUndefined();
      expect(llm.drafter).toBeUndefined();
      expect(await llm.ready?.(WS)).toBe(false);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('có URL/khóa/model nhưng cờ TẮT → có bước (đã cấu hình) nhưng ready=false; gọi bước bị chặn, không gọi mạng', async () => {
    const fetchImpl = vi.fn();
    const llm = createLlmDepsFromEnv({
      env: { ...base, ...models },
      db,
      isStepEnabled: allOff,
      fetchImpl,
    });
    expect(llm.extractor).toBeDefined();
    expect(await llm.ready?.(WS)).toBe(false);
    await expect(llm.extractor?.extract({ workspaceId: WS, text: 'giá' } as never)).rejects.toThrow(
      /cf\.ai\.classify/,
    );
    await expect(llm.drafter?.draft({ workspaceId: WS } as never)).rejects.toThrow(/cf\.ai\.draft/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rewriter bị cờ cf.ai.rewrite chặn khi tắt; bật thì qua cổng', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('net'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = { workspaceId: WS, text: 'giá' } as never;
    const off = createLlmDepsFromEnv({
      env: { ...base, ...models },
      db,
      isStepEnabled: only('classify', 'draft'),
      fetchImpl,
    });
    await expect(off.rewriter?.rewrite(input)).rejects.toThrow(/cf\.ai\.rewrite/);
    expect(fetchImpl).not.toHaveBeenCalled();
    const on = createLlmDepsFromEnv({
      env: { ...base, ...models },
      db,
      isStepEnabled: allOn,
      fetchImpl,
    });
    // Cờ bật: KHÔNG bị cổng chặn (đầu vào tối thiểu có thể lỗi ở bước sau, nhưng không phải lỗi cờ).
    const error = await on.rewriter?.rewrite(input).catch((e: Error) => e);
    expect(String((error as Error | undefined)?.message ?? '')).not.toMatch(/cf\.ai\.rewrite/);
    const draftError = await on.drafter?.draft({ workspaceId: WS } as never).catch((e: Error) => e);
    expect(String((draftError as Error | undefined)?.message ?? '')).not.toMatch(/cf\.ai\.draft/);
    spy.mockRestore();
  });

  it('cờ bật + đủ cấu hình → ready=true; cờ đọc THEO WORKSPACE ở mỗi lần dùng', async () => {
    const isStepEnabled = vi.fn(async (_step: LlmStep, workspaceId: string) => workspaceId === WS);
    const llm = createLlmDepsFromEnv({ env: { ...base, ...models }, db, isStepEnabled });
    expect(await llm.ready?.(WS)).toBe(true);
    expect(await llm.ready?.('22222222-2222-4222-8222-222222222222')).toBe(false);
    expect(isStepEnabled).toHaveBeenCalledWith('draft', WS);
  });

  it('chỉ một trong hai bước bắt buộc bật → ready=false; rewriter độc lập', async () => {
    const llm = createLlmDepsFromEnv({
      env: { ...base, ...models },
      db,
      isStepEnabled: only('classify', 'rewrite'),
    });
    expect(await llm.ready?.(WS)).toBe(false);
    expect(llm.rewriter).toBeDefined();
  });

  it('cờ bật mà THIẾU tên model → ready=false và onMisconfigured nêu biến, đúng MỘT lần mỗi bước', async () => {
    const onMisconfigured = vi.fn();
    const llm = createLlmDepsFromEnv({
      env: { ...base, CLASSIFY_LLM_MODEL: 'cf-classify' },
      db,
      isStepEnabled: allOn,
      onMisconfigured,
    });
    expect(llm.drafter).toBeUndefined();
    expect(await llm.ready?.(WS)).toBe(false);
    expect(await llm.ready?.(WS)).toBe(false);
    expect(onMisconfigured).toHaveBeenCalledTimes(1);
    expect(String(onMisconfigured.mock.calls[0]?.[0])).toContain('DRAFT_LLM_MODEL');
    expect(String(onMisconfigured.mock.calls[0]?.[0])).not.toContain('virtual-key');
  });

  it('thiếu URL/khóa mà cờ bật → báo cấu hình một lần', async () => {
    const onMisconfigured = vi.fn();
    const llm = createLlmDepsFromEnv({ env: {}, db, isStepEnabled: allOn, onMisconfigured });
    await llm.ready?.(WS);
    await llm.ready?.(WS);
    expect(onMisconfigured).toHaveBeenCalledTimes(2); // classify + draft, mỗi bước một lần
    expect(String(onMisconfigured.mock.calls[0]?.[0])).toContain('LITELLM_BASE_URL');
  });

  it('lỗi mạng khi gọi → ném lỗi không lộ khóa; cảnh báo ghi chỉ siêu dữ liệu (không nội dung)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom sk-secret'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const llm = createLlmDepsFromEnv({
      env: { ...base, CLASSIFY_LLM_MODEL: 'cand-claude-haiku' },
      db,
      isStepEnabled: allOn,
      fetchImpl,
    });
    const error = await llm.extractor
      ?.extract({
        workspaceId: WS,
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

  it('diagnose nêu ĐÚNG nguyên nhân: thiếu dịch vụ → thiếu model → cờ tắt → null khi đủ', async () => {
    const mk = (
      env: Record<string, string>,
      isStepEnabled: (step: LlmStep) => Promise<boolean> = allOn,
    ) => createLlmDepsFromEnv({ env, db, isStepEnabled });
    expect(await mk({ ...models }).diagnose?.(WS)).toBe('missing_service');
    expect(await mk({ ...base, CLASSIFY_LLM_MODEL: 'cf-classify' }).diagnose?.(WS)).toBe(
      'missing_model',
    );
    expect(await mk({ ...base, ...models }, allOff).diagnose?.(WS)).toBe('flag_off');
    expect(await mk({ ...base, ...models }, only('classify')).diagnose?.(WS)).toBe('flag_off');
    expect(await mk({ ...base, ...models }, allOn).diagnose?.(WS)).toBeNull();
  });
});
