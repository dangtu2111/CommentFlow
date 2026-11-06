import { getTranslations } from 'next-intl/server';
import {
  ONBOARDING_STEPS,
  type OnboardingStepKey,
  onboardingStepStates,
} from '../../lib/onboarding-steps';
import { Card } from '../ui/card';
import { Stepper } from '../ui/stepper';

/**
 * Thanh 5 bước onboarding (design/stitch/onboarding.png, docs/08 §7.2). Chỉ phản ánh bước hiện tại thật; các bước sau
 * hiện "Chưa bắt đầu" (không giả tiến độ). Danh sách có thứ tự để trình đọc màn hình đọc đúng thứ tự.
 */
export async function OnboardingStepper({ active }: { active: OnboardingStepKey }) {
  const t = await getTranslations();
  const states = onboardingStepStates(active);
  const steps = ONBOARDING_STEPS.map((step, index) => {
    const state = states[index] ?? 'todo';
    return {
      key: step.key,
      state,
      eyebrow: t('onboarding.stepLabel', { n: index + 1 }),
      title: t(`onboarding.steps.${step.key}.title`),
      caption:
        state === 'todo' && step.skippable
          ? t('onboarding.skippable')
          : t(`onboarding.state.${state}`),
    };
  });
  const done = states.filter((s) => s === 'done').length;
  const percent = Math.round(((done + 0.5) / ONBOARDING_STEPS.length) * 100);
  return (
    <Card>
      <Stepper label={t('onboarding.stepsLabel')} steps={steps} progress={percent} />
    </Card>
  );
}
