import { describe, expect, it } from 'vitest';
import { timestampFromRow } from './row-timestamp';

describe('timestampFromRow — mốc thời gian từ dòng `tx.execute` (drizzle trả chuỗi thô của Postgres)', () => {
  it('null/undefined → null; Date giữ nguyên (cùng tham chiếu)', () => {
    expect(timestampFromRow(null)).toBeNull();
    expect(timestampFromRow(undefined)).toBeNull();
    const d = new Date('2026-11-06T05:43:03.943Z');
    expect(timestampFromRow(d)).toBe(d);
  });

  it('chuỗi timestamptz thô của Postgres (khoảng trắng, micro giây, +00) → Date đúng mốc UTC', () => {
    const parsed = timestampFromRow('2026-11-06 05:43:03.943757+00');
    expect(parsed?.toISOString()).toBe('2026-11-06T05:43:03.943Z');
  });

  it('múi giờ khác 0 và dạng ISO 8601 đều đọc được', () => {
    expect(timestampFromRow('2026-11-06 12:43:03+07')?.toISOString()).toBe(
      '2026-11-06T05:43:03.000Z',
    );
    expect(timestampFromRow('2026-11-06T05:43:03.000Z')?.toISOString()).toBe(
      '2026-11-06T05:43:03.000Z',
    );
  });

  it('chuỗi hỏng → ném AppError VALIDATION_FAILED, không trả null (không "mở" vì dữ liệu hỏng)', () => {
    expect(() => timestampFromRow('không phải thời gian')).toThrow(/không hợp lệ/);
    expect(() => timestampFromRow('')).toThrow(/không hợp lệ/);
  });
});
