import { describe, expect, it } from 'vitest';
import { decideSize, parseSizeChartRow, type SizeChartRange } from './size-chart';

const range = (size: string, o: Partial<SizeChartRange> = {}): SizeChartRange => ({
  size,
  heightMinCm: null,
  heightMaxCm: null,
  weightMinKg: null,
  weightMaxKg: null,
  note: null,
  ...o,
});

// Bảng fixture: cao + nặng, hai khoảng liền kề không chồng nhau, S–M hở 1 cm.
const CHART = [
  range('S', { heightMinCm: 150, heightMaxCm: 157, weightMinKg: 40, weightMaxKg: 49 }),
  range('M', { heightMinCm: 158, heightMaxCm: 165, weightMinKg: 50, weightMaxKg: 57 }),
  range('L', {
    heightMinCm: 164,
    heightMaxCm: 170,
    weightMinKg: 56,
    weightMaxKg: 65,
    note: 'rộng vai',
  }),
];

describe('FR-149 parseSizeChartRow', () => {
  const base = { size: ' m ', productId: '11111111-1111-4111-8111-111111111111', heightMinCm: 158 };

  it('chuẩn hóa size in hoa, nhận theo sản phẩm hoặc theo danh mục, tính categoryNorm', () => {
    const byProduct = parseSizeChartRow(base);
    expect(byProduct.success && byProduct.data).toMatchObject({
      size: 'M',
      categoryNorm: null,
      productId: base.productId,
    });
    const byCategory = parseSizeChartRow({ size: 'xl', category: ' Áo  Thun ', weightMinKg: 70 });
    expect(byCategory.success && byCategory.data).toMatchObject({
      size: 'XL',
      category: 'Áo Thun',
      categoryNorm: 'ao thun',
      productId: null,
    });
  });

  it('bắt buộc đúng một trong sản phẩm / danh mục', () => {
    expect(parseSizeChartRow({ size: 'M', heightMinCm: 150 }).success).toBe(false);
    // Danh mục chỉ có ký tự đặc biệt → chuẩn hóa rỗng → từ chối.
    expect(parseSizeChartRow({ size: 'M', category: '!!!', heightMinCm: 150 }).success).toBe(false);
    expect(parseSizeChartRow({ ...base, category: 'Áo' }).success).toBe(false);
  });

  it('bắt buộc có ít nhất một cận chiều cao/cân nặng; min ≤ max; không âm', () => {
    expect(parseSizeChartRow({ size: 'M', productId: base.productId }).success).toBe(false);
    expect(parseSizeChartRow({ ...base, heightMinCm: 170, heightMaxCm: 160 }).success).toBe(false);
    expect(parseSizeChartRow({ ...base, heightMinCm: 160, heightMaxCm: 160 }).success).toBe(true);
    expect(parseSizeChartRow({ ...base, weightMinKg: 60, weightMaxKg: 50 }).success).toBe(false);
    expect(parseSizeChartRow({ ...base, weightMinKg: 50, weightMaxKg: 50 }).success).toBe(true);
    expect(parseSizeChartRow({ ...base, weightMinKg: -1 }).success).toBe(false);
    expect(parseSizeChartRow({ ...base, weightMinKg: 0 }).success).toBe(false);
  });

  it('từ chối size rỗng/quá dài, ghi chú quá dài, số đo sai kiểu', () => {
    expect(parseSizeChartRow({ ...base, size: '  ' }).success).toBe(false);
    expect(parseSizeChartRow({ ...base, size: 'X'.repeat(21) }).success).toBe(false);
    expect(parseSizeChartRow({ ...base, note: 'n'.repeat(201) }).success).toBe(false);
    expect(parseSizeChartRow({ ...base, measures: { ngực: { a: 1 } } }).success).toBe(false);
    const ok = parseSizeChartRow({ ...base, measures: { ngực: '84-88', eo: 66 } });
    expect(ok.success && ok.data.measures).toEqual({ ngực: '84-88', eo: 66 });
  });
});

describe('FR-149 decideSize', () => {
  it('US-102 đủ chiều cao + cân nặng, khớp đúng một size → trả size (kèm ghi chú)', () => {
    expect(decideSize(CHART, { heightCm: 160, weightKg: 53 })).toEqual({
      kind: 'size',
      size: 'M',
      note: null,
    });
    expect(decideSize(CHART, { heightCm: 169, weightKg: 60 })).toEqual({
      kind: 'size',
      size: 'L',
      note: 'rộng vai',
    });
  });

  it('biên đóng hai đầu: đúng ngưỡng vẫn khớp', () => {
    expect(decideSize(CHART, { heightCm: 150, weightKg: 40 })).toMatchObject({ size: 'S' });
    expect(decideSize(CHART, { heightCm: 157, weightKg: 49 })).toMatchObject({ size: 'S' });
  });

  it('thiếu số đo → hỏi lại đúng cái thiếu (không đoán)', () => {
    expect(decideSize(CHART, { heightCm: null, weightKg: 53 })).toEqual({
      kind: 'ask',
      missing: ['height'],
    });
    expect(decideSize(CHART, {})).toEqual({ kind: 'ask', missing: ['height', 'weight'] });
    expect(decideSize(CHART, { heightCm: 160, weightKg: 0 })).toEqual({
      kind: 'ask',
      missing: ['weight'],
    });
    expect(decideSize(CHART, { heightCm: Number.NaN, weightKg: 53 })).toEqual({
      kind: 'ask',
      missing: ['height'],
    });
  });

  it('bảng chỉ theo chiều cao → không đòi cân nặng', () => {
    const heightOnly = [
      range('M', { heightMinCm: 150, heightMaxCm: 160 }),
      range('L', { heightMinCm: 161, heightMaxCm: 170 }),
    ];
    expect(decideSize(heightOnly, { heightCm: 165 })).toMatchObject({ kind: 'size', size: 'L' });
  });

  it('hai size cùng khớp (khoảng chồng nhau) → mời ib, không chọn bừa', () => {
    expect(decideSize(CHART, { heightCm: 164, weightKg: 56 })).toEqual({
      kind: 'handoff',
      reason: 'between_sizes',
      sizes: ['M', 'L'],
      recordGap: false,
    });
  });

  it('chiều cao khớp một size, cân nặng khớp size khác → không size nào khớp, nằm giữa → mời ib', () => {
    expect(decideSize(CHART, { heightCm: 160, weightKg: 60 })).toMatchObject({
      kind: 'handoff',
      reason: 'between_sizes',
      recordGap: false,
    });
  });

  it('ngoài bảng (nhỏ hơn hoặc lớn hơn mọi khoảng) → mời ib', () => {
    expect(decideSize(CHART, { heightCm: 140, weightKg: 45 })).toMatchObject({
      kind: 'handoff',
      reason: 'out_of_range',
    });
    expect(decideSize(CHART, { heightCm: 175, weightKg: 70 })).toMatchObject({
      kind: 'handoff',
      reason: 'out_of_range',
    });
  });

  it('khoảng hở giữa hai size (157,5 cm) → between_sizes', () => {
    expect(decideSize(CHART, { heightCm: 157.5, weightKg: 50 })).toMatchObject({
      kind: 'handoff',
      reason: 'between_sizes',
    });
  });

  it('cận mở một đầu: "XL từ 66 kg" khớp mọi cân nặng ≥ 66', () => {
    const open = [
      range('L', { weightMinKg: 56, weightMaxKg: 65 }),
      range('XL', { weightMinKg: 66 }),
    ];
    expect(decideSize(open, { weightKg: 90 })).toMatchObject({ kind: 'size', size: 'XL' });
    expect(decideSize(open, { weightKg: 30 })).toMatchObject({
      kind: 'handoff',
      reason: 'out_of_range',
    });
  });

  it('cận mở phía dưới ("XS dưới 45 kg"): kẽ hở giữa hai size vẫn là between_sizes, không phải ngoài bảng', () => {
    const open = [
      range('XS', { weightMaxKg: 45 }),
      range('L', { weightMinKg: 50, weightMaxKg: 60 }),
    ];
    expect(decideSize(open, { weightKg: 30 })).toMatchObject({ kind: 'size', size: 'XS' });
    expect(decideSize(open, { weightKg: 47 })).toMatchObject({
      kind: 'handoff',
      reason: 'between_sizes',
    });
    expect(decideSize(open, { weightKg: 70 })).toMatchObject({
      kind: 'handoff',
      reason: 'out_of_range',
    });
  });

  it('dòng không ràng buộc một chiều không làm lệch khoảng bao của chiều đó', () => {
    const mixed = [
      range('A', { heightMinCm: 150, heightMaxCm: 160, weightMinKg: 40, weightMaxKg: 50 }),
      range('B', { weightMinKg: 51, weightMaxKg: 60 }),
    ];
    expect(decideSize(mixed, { heightCm: 155, weightKg: 70 })).toMatchObject({
      kind: 'handoff',
      reason: 'out_of_range',
    });
  });

  it('không có bảng size → mời ib và ghi khoảng trống kiến thức (kb_gaps topic size)', () => {
    expect(decideSize([], { heightCm: 160, weightKg: 53 })).toEqual({
      kind: 'handoff',
      reason: 'no_chart',
      sizes: [],
      recordGap: true,
    });
    // Không có bảng thì không hỏi lại số đo.
    expect(decideSize([], {})).toMatchObject({ kind: 'handoff', reason: 'no_chart' });
  });
});
