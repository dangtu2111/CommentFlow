import { describe, expect, it } from 'vitest';
import { isLastOwnerViolation, isRlsViolation, isUniqueViolation, pgField } from './pg-errors';

describe('pg-errors (đơn vị)', () => {
  it('pgField ưu tiên lỗi gốc trong cause, rồi tới chính lỗi, và chịu được giá trị rỗng', () => {
    expect(pgField({ cause: { code: 'A' }, code: 'B' }, 'code')).toBe('A');
    expect(pgField({ code: 'B' }, 'code')).toBe('B');
    expect(pgField(undefined, 'code')).toBeUndefined();
  });

  it('isUniqueViolation chỉ đúng với 23505', () => {
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ code: '23514' })).toBe(false);
  });

  it('isLastOwnerViolation cần cả mã 23514 và constraint members_last_owner', () => {
    expect(
      isLastOwnerViolation({ cause: { code: '23514', constraint: 'members_last_owner' } }),
    ).toBe(true);
    expect(isLastOwnerViolation({ code: '23514', constraint: 'khac' })).toBe(false);
    expect(isLastOwnerViolation({ code: '23505', constraint: 'members_last_owner' })).toBe(false);
  });

  it('isRlsViolation: 42501 do RLS mới tính; thiếu quyền cột/bảng phải nổi lên nguyên dạng', () => {
    expect(
      isRlsViolation({ code: '42501', message: 'new row violates row-level security policy' }),
    ).toBe(true);
    expect(
      isRlsViolation({ cause: { code: '42501', message: 'new row violates ROW-LEVEL SECURITY' } }),
    ).toBe(true);
    expect(isRlsViolation({ code: '42501', message: 'permission denied for table x' })).toBe(false);
    expect(isRlsViolation({ code: '23505', message: 'row-level security' })).toBe(false);
    expect(isRlsViolation({ code: '42501' })).toBe(false);
  });
});
