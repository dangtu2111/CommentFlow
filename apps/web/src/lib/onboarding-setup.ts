import type { OnboardingStepKey } from './onboarding-steps';

/**
 * Điều hướng wizard thiết lập (FR-146, docs/08 §7.2) sau bước "Tạo workspace". Thuần, không đụng dữ liệu: chỉ chọn bước
 * từ tham số URL và tính liên kết quay lại/tiếp tục.
 */
export const SETUP_BASE_PATH = '/app/onboarding/setup';
export const WORKSPACE_STEP_PATH = '/app/onboarding/workspace';

export type SetupStepKey = Exclude<OnboardingStepKey, 'workspace'>;
export const SETUP_STEPS: readonly SetupStepKey[] = ['channels', 'pages', 'knowledge', 'invite'];

export function parseSetupStep(raw: string | string[] | undefined): SetupStepKey {
  return typeof raw === 'string' && (SETUP_STEPS as readonly string[]).includes(raw)
    ? (raw as SetupStepKey)
    : 'channels';
}

const stepHref = (step: SetupStepKey) => `${SETUP_BASE_PATH}?step=${step}`;

export function setupNav(step: SetupStepKey): { back: string; next: string } {
  const index = SETUP_STEPS.indexOf(step);
  const prev = SETUP_STEPS[index - 1];
  const next = SETUP_STEPS[index + 1];
  return {
    back: prev ? stepHref(prev) : WORKSPACE_STEP_PATH,
    next: next ? stepHref(next) : '/app',
  };
}

/** Bước nên mở khi người dùng vào wizard: chưa có kênh → kết nối; chưa đủ độ sẵn sàng → kiến thức; còn lại → mời. */
export function suggestSetupStep(input: { channelCount: number; aiReady: boolean }): SetupStepKey {
  if (input.channelCount === 0) return 'channels';
  return input.aiReady ? 'invite' : 'knowledge';
}
