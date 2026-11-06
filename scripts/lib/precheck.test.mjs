import { describe, expect, it } from 'vitest';
import { PRECHECK_STEPS, runSteps } from './precheck.mjs';

describe('PRECHECK_STEPS', () => {
  it('gồm đủ 7 bước theo thứ tự rẻ → đắt', () => {
    expect(PRECHECK_STEPS.map((s) => s.script)).toEqual([
      'lint',
      'format:check',
      'typecheck',
      'check:migrations',
      'check:plans',
      'codemap:check',
      'quyet:check',
    ]);
  });
});

describe('runSteps', () => {
  const steps = [{ script: 'a' }, { script: 'b' }, { script: 'c' }];

  it('chạy tuần tự tất cả khi xanh', () => {
    const seen = [];
    const r = runSteps(steps, (s) => {
      seen.push(s.script);
      return 0;
    });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(r).toEqual({ ok: true, failed: null });
  });

  it('dừng ở lỗi đầu, không chạy bước sau', () => {
    const seen = [];
    const r = runSteps(steps, (s) => {
      seen.push(s.script);
      return s.script === 'b' ? 1 : 0;
    });
    expect(seen).toEqual(['a', 'b']);
    expect(r).toEqual({ ok: false, failed: 'b' });
  });
});
