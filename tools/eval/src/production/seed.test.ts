import { describe, expect, it } from 'vitest';
import { assertDevDatabase, policyKindOf, stableId } from './seed';

describe('nạp [EVAL] — hàm thuần', () => {
  it('loại chính sách lạ → other; loại hợp lệ giữ nguyên', () => {
    expect(policyKindOf('shipping')).toBe('shipping');
    expect(policyKindOf('warranty')).toBe('warranty');
    expect(policyKindOf('khac')).toBe('other');
    expect(policyKindOf(null)).toBe('other');
  });

  it('chỉ cho cf_dev / cf_test*; staging/production/lạ → lỗi', () => {
    expect(() => assertDevDatabase('postgres://u:p@h:5432/cf_dev')).not.toThrow();
    expect(() => assertDevDatabase('postgres://u:p@h:5432/cf_test')).not.toThrow();
    expect(() => assertDevDatabase('postgres://u:p@h:5432/cf_test_ab12')).not.toThrow();
    expect(() => assertDevDatabase('postgres://u:p@h:5432/cf_staging')).toThrow(/cf_dev/);
    expect(() => assertDevDatabase('postgres://u:p@h:5432/cf_prod')).toThrow();
    expect(() => assertDevDatabase('')).toThrow();
  });

  it('stableId: cùng đầu vào → cùng UUID hợp lệ; khác mục/loại → khác', () => {
    const a = stableId('shop', 'policy', 'p1');
    expect(a).toBe(stableId('shop', 'policy', 'p1'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(stableId('shop', 'policy', 'p2'));
    expect(a).not.toBe(stableId('shop', 'faq', 'p1'));
  });
});
