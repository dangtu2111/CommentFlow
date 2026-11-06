import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatPercent,
  hourBars,
  parseReportRange,
  reportWindow,
} from './report-view';

describe('REPORTS giao diện: khoảng ngày', () => {
  it('chỉ nhận 7 hoặc 30, còn lại về 7', () => {
    expect(parseReportRange('30')).toBe(30);
    expect(parseReportRange('7')).toBe(7);
    expect(parseReportRange('9999')).toBe(7);
    expect(parseReportRange(undefined)).toBe(7);
    expect(parseReportRange(['30', '7'])).toBe(7);
  });

  it('cửa sổ kết thúc đúng lúc "bây giờ", bắt đầu lùi đủ số ngày', () => {
    const now = new Date('2026-11-06T10:00:00.000Z');
    const w = reportWindow(7, now);
    expect(w.to.toISOString()).toBe(now.toISOString());
    expect(w.from.toISOString()).toBe('2026-10-30T10:00:00.000Z');
  });
});

describe('REPORTS giao diện: định dạng số', () => {
  it('thời lượng: giây, phút+giây, giờ+phút; null → gạch', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(72_000)).toBe('1m 12s');
    expect(formatDuration(3_900_000)).toBe('1h 5m');
    expect(formatDuration(0)).toBe('0s');
  });

  it('phần trăm một chữ số thập phân; null → gạch', () => {
    expect(formatPercent(0.685)).toBe('68.5%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('REPORTS giao diện: cột theo giờ', () => {
  it('chiều cao theo cột lớn nhất; toàn 0 → mọi cột 0; đánh dấu giờ cao điểm', () => {
    const dist = Array.from({ length: 24 }, (_, h) => (h === 9 ? 10 : h === 20 ? 5 : 0));
    const bars = hourBars(dist, [9]);
    expect(bars).toHaveLength(24);
    expect(bars[9]).toEqual({ hour: 9, count: 10, pct: 100, peak: true });
    expect(bars[20]).toEqual({ hour: 20, count: 5, pct: 50, peak: false });
    expect(hourBars(new Array(24).fill(0), []).every((b) => b.pct === 0)).toBe(true);
  });
});
