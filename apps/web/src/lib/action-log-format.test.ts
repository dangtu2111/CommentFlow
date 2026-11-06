import { describe, expect, it } from 'vitest';
import { actionLabelKey, diffRows, formatLogValue, onBehalfOfDisplay } from './action-log-format';

describe('FR-092 nhãn hành động', () => {
  it('FR-092 mã đã biết có khóa dịch, mã lạ thì null (hiện mã thô)', () => {
    expect(actionLabelKey('member.role_changed')).toBe('member_role_changed');
    expect(actionLabelKey('member.left')).toBe('member_left');
    expect(actionLabelKey('khong.biet')).toBeNull();
  });
});

describe('FR-092 formatLogValue', () => {
  it('FR-092 chuỗi giữ nguyên; số/boolean/null/đối tượng thành chuỗi đọc được', () => {
    expect(formatLogValue('staff')).toBe('staff');
    expect(formatLogValue(3)).toBe('3');
    expect(formatLogValue(true)).toBe('true');
    expect(formatLogValue(null)).toBe('');
    expect(formatLogValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe('FR-092 diffRows (trước/sau)', () => {
  it('FR-092 hợp khóa hai phía, đánh dấu khóa đổi; khóa không đổi không đánh dấu', () => {
    expect(diffRows({ role: 'staff', keep: 1 }, { role: 'owner', keep: 1, extra: 'x' })).toEqual([
      { key: 'extra', before: null, after: 'x', changed: true },
      { key: 'keep', before: '1', after: '1', changed: false },
      { key: 'role', before: 'staff', after: 'owner', changed: true },
    ]);
  });

  it('FR-092 thiếu một phía hoặc không phải đối tượng thì phía đó coi như rỗng', () => {
    expect(diffRows(null, { role: 'owner' })).toEqual([
      { key: 'role', before: null, after: 'owner', changed: true },
    ]);
    expect(diffRows('x', [1])).toEqual([]);
    expect(diffRows(null, null)).toEqual([]);
  });
});

describe('LOG-STAFF-SYSTEM-ROWS onBehalfOfDisplay', () => {
  it('không có người yêu cầu → null (hiện "Hệ thống" trơn)', () => {
    expect(onBehalfOfDisplay(null, null, 'u1')).toBeNull();
  });

  it('người yêu cầu là chính người xem → self (không cần tên)', () => {
    expect(onBehalfOfDisplay('u1', 'An', 'u1')).toEqual({ kind: 'self' });
  });

  it('người khác có tên → named; không còn tên (đã rời/xóa) → former, không lộ mã người dùng', () => {
    expect(onBehalfOfDisplay('u2', 'Bình', 'u1')).toEqual({ kind: 'named', name: 'Bình' });
    expect(onBehalfOfDisplay('u2', null, 'u1')).toEqual({ kind: 'former' });
  });
});
