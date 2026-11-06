import { AppError } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildKeyAlias, computeKeyBudget, isVirtualKeysEnabled } from './config';

const WS = '0b6f2a3e-5d41-4c8e-9a10-7f3d2e1c4b5a';

describe('FR-034 cờ khóa ảo', () => {
  it('chỉ đúng chữ true mới bật', () => {
    expect(isVirtualKeysEnabled('true')).toBe(true);
    for (const v of [undefined, '', 'TRUE', 'True', '1', 'yes', ' true', 'false']) {
      expect(isVirtualKeysEnabled(v)).toBe(false);
    }
  });
});

describe('FR-034 alias khóa luôn chứa workspace_id', () => {
  it('alias = cf-ws-<uuid chữ thường>', () => {
    expect(buildKeyAlias(WS.toUpperCase())).toBe(`cf-ws-${WS}`);
  });

  it('workspace_id không phải uuid → VALIDATION_FAILED', () => {
    expect(() => buildKeyAlias('abc')).toThrow(AppError);
    expect(() => buildKeyAlias('')).toThrow(AppError);
  });

  it('property: hai workspace khác nhau không bao giờ chung alias, alias chứa id', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (a, b) => {
        expect(buildKeyAlias(a)).toContain(a.toLowerCase());
        if (a.toLowerCase() !== b.toLowerCase()) {
          expect(buildKeyAlias(a)).not.toBe(buildKeyAlias(b));
        }
      }),
    );
  });
});

describe('FR-034 ngân sách khóa = trần chi phí AI', () => {
  it('có trần → max_budget = trần, chu kỳ 1 tháng', () => {
    expect(computeKeyBudget({ capUsd: 12.5, defaultBudgetUsd: 5 })).toEqual({
      maxBudgetUsd: 12.5,
      budgetDuration: '1mo',
    });
  });

  it('chưa đặt trần → ngân sách mặc định', () => {
    expect(computeKeyBudget({ capUsd: null, defaultBudgetUsd: 5 }).maxBudgetUsd).toBe(5);
  });

  it('trần 0 giữ nguyên 0 (chặn hết, không rơi về mặc định)', () => {
    expect(computeKeyBudget({ capUsd: 0, defaultBudgetUsd: 5 }).maxBudgetUsd).toBe(0);
  });

  it('số hỏng/âm/vô cực → VALIDATION_FAILED', () => {
    for (const capUsd of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computeKeyBudget({ capUsd, defaultBudgetUsd: 5 })).toThrow(AppError);
    }
    expect(() => computeKeyBudget({ capUsd: null, defaultBudgetUsd: -1 })).toThrow(AppError);
  });

  it('property: ngân sách luôn bằng trần khi có trần hợp lệ', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e6, noNaN: true }), (cap) => {
        expect(computeKeyBudget({ capUsd: cap, defaultBudgetUsd: 1 }).maxBudgetUsd).toBe(cap);
      }),
    );
  });
});
