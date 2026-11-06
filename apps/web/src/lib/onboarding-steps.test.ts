import { describe, expect, it } from 'vitest';
import { ONBOARDING_STEPS, onboardingStepStates } from './onboarding-steps';

describe('FR-001 thanh các bước onboarding (docs/08 §7.2)', () => {
  it('FR-001 có đúng 5 bước theo thứ tự thiết kế; chỉ bước cuối bỏ qua được', () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual([
      'workspace',
      'channels',
      'pages',
      'knowledge',
      'invite',
    ]);
    expect(ONBOARDING_STEPS.filter((s) => s.skippable).map((s) => s.key)).toEqual(['invite']);
  });

  it('FR-001 bước hiện tại "current", trước đó "done", sau đó "todo"', () => {
    expect(onboardingStepStates('workspace')).toEqual(['current', 'todo', 'todo', 'todo', 'todo']);
    expect(onboardingStepStates('pages')).toEqual(['done', 'done', 'current', 'todo', 'todo']);
    expect(onboardingStepStates('invite')).toEqual(['done', 'done', 'done', 'done', 'current']);
  });
});
