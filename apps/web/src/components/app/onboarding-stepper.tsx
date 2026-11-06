import { Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import {
  ONBOARDING_STEPS,
  type OnboardingStepKey,
  onboardingStepStates,
} from '../../lib/onboarding-steps';

/**
 * Thanh 5 bước onboarding (design/stitch/onboarding.png, docs/08 §7.2). Chỉ phản ánh bước hiện tại thật; các bước sau
 * hiện "Chưa bắt đầu" (không giả tiến độ). Danh sách có thứ tự để trình đọc màn hình đọc đúng thứ tự.
 */
export async function OnboardingStepper({ active }: { active: OnboardingStepKey }) {
  const t = await getTranslations();
  const states = onboardingStepStates(active);
  const rows = ONBOARDING_STEPS.map((step, index) => ({ step, state: states[index] ?? 'todo' }));
  const done = states.filter((s) => s === 'done').length;
  const percent = Math.round(((done + 0.5) / ONBOARDING_STEPS.length) * 100);
  return (
    <section className="card stepper" aria-label={t('onboarding.stepsLabel')}>
      <ol className="stepper-list">
        {rows.map(({ step, state }, index) => (
          <li
            key={step.key}
            className={`stepper-step stepper-${state}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="stepper-badge" aria-hidden="true">
              {state === 'done' ? <Check size={18} /> : index + 1}
            </span>
            <span className="stepper-text">
              <span className="stepper-eyebrow">{t('onboarding.stepLabel', { n: index + 1 })}</span>
              <span className="stepper-title">{t(`onboarding.steps.${step.key}.title`)}</span>
              <span className="stepper-state">
                {state === 'todo' && step.skippable
                  ? t('onboarding.skippable')
                  : t(`onboarding.state.${state}`)}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div className="stepper-bar" aria-hidden="true">
        <div className="stepper-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </section>
  );
}
