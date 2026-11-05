import { describe, expect, it } from 'vitest';
import { BULK_MAX, parseBulkIds, parseBulkLabel } from './bulk-input';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('FR-045 parseBulkIds — đầu vào hành động hàng loạt', () => {
  it('FR-045 khử trùng, giữ thứ tự', () => {
    expect(parseBulkIds([A, B, A])).toEqual({ ok: true, ids: [A, B] });
  });

  it('FR-045 rỗng / không phải mảng / có id không phải UUID → invalid_input', () => {
    for (const bad of [[], 'x', null, undefined, [A, 'khong-phai-uuid'], [A, 5]]) {
      expect(parseBulkIds(bad)).toEqual({ ok: false, reason: 'invalid_input' });
    }
  });

  it('FR-045 đúng trần BULK_MAX qua, BULK_MAX+1 → too_many (ca biên)', () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(parseBulkIds(make(BULK_MAX)).ok).toBe(true);
    expect(parseBulkIds(make(BULK_MAX + 1))).toEqual({ ok: false, reason: 'too_many' });
  });
});

describe('FR-045 parseBulkLabel', () => {
  it('FR-045 chỉ nhận nhãn trong bộ chuẩn', () => {
    expect(parseBulkLabel('complaint')).toEqual({ ok: true, label: 'complaint' });
    for (const bad of ['hỏi giá', '', 'PRICE', null, 3]) {
      expect(parseBulkLabel(bad)).toEqual({ ok: false, reason: 'invalid_label' });
    }
  });
});
