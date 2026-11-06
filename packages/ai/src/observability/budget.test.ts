import { describe, expect, it } from 'vitest';
import { buildKeyBudget, checkBudget } from './budget';

describe('FR-034 giới hạn ngân sách khóa ảo', () => {
  it('sinh tham số khóa ảo LiteLLM', () => {
    expect(buildKeyBudget({ maxBudgetUsd: 5, period: '30d' })).toEqual({
      max_budget: 5,
      budget_duration: '30d',
    });
  });

  it('kèm ngân sách theo từng model', () => {
    const out = buildKeyBudget({ maxBudgetUsd: 5, period: '1d', perModelUsd: { 'cf-draft': 2 } });
    expect(out.model_max_budget).toEqual({ 'cf-draft': { budget_limit: 2, time_period: '1d' } });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('từ chối ngân sách %s', (v) => {
    expect(() => buildKeyBudget({ maxBudgetUsd: v, period: '1d' })).toThrow(/ngân sách/i);
  });

  it('từ chối ngân sách theo model không hợp lệ', () => {
    expect(() => buildKeyBudget({ maxBudgetUsd: 5, period: '1d', perModelUsd: { x: 0 } })).toThrow(
      /ngân sách/i,
    );
  });

  it('từ chối chu kỳ lạ', () => {
    expect(() => buildKeyBudget({ maxBudgetUsd: 5, period: '2d' as never })).toThrow();
  });

  it('checkBudget: dưới 80% ok, đúng 80% warn, đúng 100% exceeded', () => {
    expect(checkBudget({ spentUsd: 3.99, maxBudgetUsd: 5 }).status).toBe('ok');
    expect(checkBudget({ spentUsd: 4, maxBudgetUsd: 5 }).status).toBe('warn');
    expect(checkBudget({ spentUsd: 5, maxBudgetUsd: 5 }).status).toBe('exceeded');
    expect(checkBudget({ spentUsd: 9, maxBudgetUsd: 5 }).ratio).toBe(1.8);
  });

  it('checkBudget: đầu vào hỏng → từ chối', () => {
    expect(() => checkBudget({ spentUsd: -1, maxBudgetUsd: 5 })).toThrow();
    expect(() => checkBudget({ spentUsd: 1, maxBudgetUsd: 0 })).toThrow();
  });
});
