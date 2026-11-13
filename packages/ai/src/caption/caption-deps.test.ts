import { describe, expect, it, vi } from 'vitest';
import { createCaptionDepsFromEnv } from './caption-deps';

const db = { withWorkspace: vi.fn() } as never;
const env = {
  LITELLM_BASE_URL: 'http://llm.test',
  LITELLM_API_KEY: 'sk-test',
  CAPTION_LLM_MODEL: 'cf-caption',
};
const build = (over: { env?: Record<string, string | undefined>; enabled?: boolean } = {}) => {
  const onMisconfigured = vi.fn();
  const deps = createCaptionDepsFromEnv({
    env: over.env ?? env,
    db,
    isEnabled: async () => over.enabled ?? true,
    onMisconfigured,
  });
  return { deps, onMisconfigured };
};

describe('createCaptionDepsFromEnv — không có bản giả khi thiếu cấu hình', () => {
  it('đủ cấu hình + cờ bật → có captioner và diagnose = null', async () => {
    const { deps } = build();
    expect(deps.captioner).toBeDefined();
    expect(await deps.diagnose('w1')).toBeNull();
  });

  it('thiếu địa chỉ/khóa LiteLLM → missing_service, KHÔNG có captioner; cờ bật thì ghi cảnh báo cấu hình đúng MỘT lần', async () => {
    const { deps, onMisconfigured } = build({ env: { CAPTION_LLM_MODEL: 'm' } });
    expect(deps.captioner).toBeUndefined();
    expect(await deps.diagnose('w1')).toBe('missing_service');
    await deps.diagnose('w1');
    expect(onMisconfigured).toHaveBeenCalledTimes(1);
  });

  it('thiếu tên model → missing_model (không dùng model mặc định); cờ tắt → flag_off, không cảnh báo', async () => {
    const noModel = build({ env: { LITELLM_BASE_URL: 'http://x', LITELLM_API_KEY: 'k' } });
    expect(noModel.deps.captioner).toBeUndefined();
    expect(await noModel.deps.diagnose('w1')).toBe('missing_model');
    const off = build({ enabled: false });
    expect(await off.deps.diagnose('w1')).toBe('flag_off');
    expect(off.onMisconfigured).not.toHaveBeenCalled();
  });

  it('cờ tắt tại thời điểm gọi → captioner từ chối (LLM_UNAVAILABLE), không gọi mạng', async () => {
    let enabled = true;
    const deps = createCaptionDepsFromEnv({ env, db, isEnabled: async () => enabled });
    enabled = false;
    await expect(
      deps.captioner?.suggestCaption({ workspaceId: 'w1', draft: 'ý tưởng' }),
    ).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
  });
});

describe('createCaptionDepsFromEnv — cổng cờ ở MỖI lần gọi', () => {
  it('cờ tắt giữa chừng → cả caption lẫn hashtag ném LLM_UNAVAILABLE, KHÔNG gọi LLM', async () => {
    let enabled = true;
    const fetchImpl = vi.fn();
    const deps = createCaptionDepsFromEnv({
      env,
      db,
      isEnabled: async () => enabled,
      fetchImpl: fetchImpl as never,
    });
    enabled = false;
    const input = { workspaceId: 'w1', draft: 'ý tưởng' };
    await expect(deps.captioner?.suggestCaption(input)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
    });
    await expect(deps.captioner?.suggestHashtags(input)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('cờ bật nhưng LiteLLM lỗi → lỗi được ném tiếp (không nuốt), nhật ký chỉ có siêu dữ liệu', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }));
    const deps = createCaptionDepsFromEnv({
      env,
      db: { withWorkspace: async (_w: string, fn: (tx: unknown) => unknown) => fn({}) } as never,
      isEnabled: async () => true,
      fetchImpl: fetchImpl as never,
    });
    const input = { workspaceId: '11111111-1111-4111-8111-111111111111', draft: 'NỘI DUNG RIÊNG' };
    await expect(deps.captioner?.suggestCaption(input)).rejects.toBeDefined();
    await expect(deps.captioner?.suggestHashtags(input)).rejects.toBeDefined();
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain('NỘI DUNG RIÊNG');
    logged.mockRestore();
  });
});
