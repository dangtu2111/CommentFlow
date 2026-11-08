import { describe, expect, it } from 'vitest';
import { AI_STEP_FLAGS, FLAG_DEFAULTS, PIPELINE_FLAG } from './flag-keys';

describe('khóa cờ AI', () => {
  it('ba bước có khóa riêng và MẶC ĐỊNH TẮT trong mã', () => {
    expect(Object.values(AI_STEP_FLAGS)).toEqual([
      'cf.ai.classify',
      'cf.ai.draft',
      'cf.ai.rewrite',
    ]);
    for (const key of Object.values(AI_STEP_FLAGS)) expect(FLAG_DEFAULTS[key]).toBe(false);
  });

  it('cờ pipeline theo workspace có khóa riêng và MẶC ĐỊNH TẮT', () => {
    expect(PIPELINE_FLAG).toBe('cf.pipeline.v2');
    expect(FLAG_DEFAULTS[PIPELINE_FLAG]).toBe(false);
  });
});
