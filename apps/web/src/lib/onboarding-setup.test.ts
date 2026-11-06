import { describe, expect, it } from 'vitest';
import { parseSetupStep, SETUP_BASE_PATH, setupNav, suggestSetupStep } from './onboarding-setup';

describe('FR-146 wizard thiết lập sau khi tạo workspace (docs/08 §7.2)', () => {
  it('FR-146 parseSetupStep chỉ nhận 4 bước sau "workspace"; sai/thiếu → channels', () => {
    expect(parseSetupStep('pages')).toBe('pages');
    expect(parseSetupStep('invite')).toBe('invite');
    expect(parseSetupStep('workspace')).toBe('channels');
    expect(parseSetupStep(undefined)).toBe('channels');
    expect(parseSetupStep(['knowledge', 'x'])).toBe('channels');
    expect(parseSetupStep('<script>')).toBe('channels');
  });

  it('FR-146 setupNav: bước đầu quay lại trang workspace; bước cuối không có "tiếp"', () => {
    expect(setupNav('channels')).toEqual({
      back: '/app/onboarding/workspace',
      next: `${SETUP_BASE_PATH}?step=pages`,
    });
    expect(setupNav('knowledge')).toEqual({
      back: `${SETUP_BASE_PATH}?step=pages`,
      next: `${SETUP_BASE_PATH}?step=invite`,
    });
    expect(setupNav('invite')).toEqual({ back: `${SETUP_BASE_PATH}?step=knowledge`, next: '/app' });
  });

  it('FR-146 suggestSetupStep: chưa kênh → channels; có kênh chưa đủ AI → knowledge; sẵn sàng → invite', () => {
    expect(suggestSetupStep({ channelCount: 0, aiReady: false })).toBe('channels');
    expect(suggestSetupStep({ channelCount: 2, aiReady: false })).toBe('knowledge');
    expect(suggestSetupStep({ channelCount: 1, aiReady: true })).toBe('invite');
    expect(suggestSetupStep({ channelCount: 0, aiReady: true })).toBe('channels');
  });
});
