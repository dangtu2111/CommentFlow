/**
 * Các bước onboarding (docs/08 §7.2, design/stitch/onboarding.png). Thuần. Hiện chỉ bước `workspace` có trang thật;
 * các bước còn lại hiện đúng trạng thái "chưa bắt đầu" (không giả tiến độ).
 */
export type OnboardingStepKey = 'workspace' | 'channels' | 'pages' | 'knowledge' | 'invite';
export type OnboardingStepState = 'done' | 'current' | 'todo';

export const ONBOARDING_STEPS: ReadonlyArray<{ key: OnboardingStepKey; skippable: boolean }> = [
  { key: 'workspace', skippable: false },
  { key: 'channels', skippable: false },
  { key: 'pages', skippable: false },
  { key: 'knowledge', skippable: false },
  { key: 'invite', skippable: true },
];

export function onboardingStepStates(current: OnboardingStepKey): OnboardingStepState[] {
  const index = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  return ONBOARDING_STEPS.map((_, i) => (i < index ? 'done' : i === index ? 'current' : 'todo'));
}
