import { describe, expect, it } from 'vitest';
import { compareTexts, formatReport, normalizeText } from './ui-completeness.mjs';

describe('normalizeText', () => {
  it('bỏ dấu cách thừa, hạ chữ thường', () => {
    expect(normalizeText('  Dừng   KHẨN cấp ')).toBe('dừng khẩn cấp');
  });
  it('bỏ số liệu cụ thể (số, %, đ)', () => {
    expect(normalizeText('Đã dùng 1.250 / 5.000 lượt')).toBe('đã dùng / lượt');
    expect(normalizeText('Ngưỡng 85%')).toBe('ngưỡng');
    expect(normalizeText('12,5 đ')).toBe('');
  });
  it('không cắt đầu chữ đứng sau số', () => {
    expect(normalizeText('Bật 3 kênh')).toBe('bật kênh');
    expect(normalizeText('Đang chạy 2 đơn')).toBe('đang chạy đơn');
  });
  it('chữ chỉ có số/ký hiệu → rỗng', () => {
    expect(normalizeText('123')).toBe('');
    expect(normalizeText('—')).toBe('');
  });
  it('bỏ nhãn [MẪU] đứng đầu', () => {
    expect(normalizeText('[MẪU] Trang Facebook')).toBe('trang facebook');
  });
});

describe('compareTexts', () => {
  it('liệt kê mục có trong HTML nhưng thiếu ở trang, không trùng lặp', () => {
    const r = compareTexts(['Dừng khẩn cấp', 'Lưu', 'lưu', 'Nhật ký'], ['Lưu', 'Bật tự gửi']);
    expect(r.missing).toEqual(['dừng khẩn cấp', 'nhật ký']);
    expect(r.matched).toEqual(['lưu']);
    expect(r.total).toBe(3);
    expect(r.percent).toBeCloseTo(33.3, 1);
  });
  it('khớp khi trang chứa mục như một phần của chuỗi dài hơn', () => {
    const r = compareTexts(['Tự ẩn SĐT'], ['Tự ẩn SĐT trong bình luận']);
    expect(r.missing).toEqual([]);
  });
  it('HTML không có chữ → 100%', () => {
    expect(compareTexts([], ['a']).percent).toBe(100);
  });
  it('bỏ mục chỉ-số khỏi tổng', () => {
    expect(compareTexts(['12', 'Lưu'], ['Lưu']).total).toBe(1);
  });
});

describe('formatReport', () => {
  it('in tỉ lệ và danh sách thiếu', () => {
    const out = formatReport(
      'automation',
      '/app/automation',
      compareTexts(['A b', 'C d'], ['a b']),
    );
    expect(out).toContain('automation');
    expect(out).toContain('50.0%');
    expect(out).toContain('- c d');
  });
});
