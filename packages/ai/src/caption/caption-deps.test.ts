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
