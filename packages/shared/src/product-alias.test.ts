import { describe, expect, it } from 'vitest';
import { ALIAS_MATCH_THRESHOLD, PRODUCT_ALIAS_MAX, parseProductAlias } from './product-alias';

describe('FR-128 parseProductAlias', () => {
  it('cắt khoảng trắng, gộp khoảng trắng giữa, tính aliasNorm không dấu, mặc định nguồn staff', () => {
    const r = parseProductAlias({ alias: '  Mẫu   Hồng ' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ alias: 'Mẫu Hồng', aliasNorm: 'mau hong', source: 'staff' });
    }
  });

  it('từ chối rỗng, chỉ ký hiệu, và quá dài', () => {
    expect(parseProductAlias({ alias: '   ' }).success).toBe(false);
    expect(parseProductAlias({ alias: '!!! ???' }).success).toBe(false);
    expect(parseProductAlias({ alias: 'a'.repeat(PRODUCT_ALIAS_MAX) }).success).toBe(true);
    expect(parseProductAlias({ alias: 'a'.repeat(PRODUCT_ALIAS_MAX + 1) }).success).toBe(false);
  });

  it('từ chối nguồn lạ; nhận import', () => {
    expect(parseProductAlias({ alias: 'set đi biển', source: 'x' }).success).toBe(false);
    const r = parseProductAlias({ alias: 'set đi biển', source: 'import' });
    expect(r.success && r.data.source).toBe('import');
  });

  it('US-100 aliasNorm lũy đẳng', () => {
    const r = parseProductAlias({ alias: 'Đầm Xòe' });
    expect(r.success && r.data.aliasNorm).toBe('dam xoe');
    const again = parseProductAlias({ alias: (r.success && r.data.aliasNorm) || '' });
    expect(again.success && again.data.aliasNorm).toBe('dam xoe');
  });

  it('ngưỡng khớp bí danh là 0,6 (docs/10 §5.1)', () => {
    expect(ALIAS_MATCH_THRESHOLD).toBe(0.6);
  });
});
