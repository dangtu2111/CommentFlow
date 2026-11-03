import { describe, expect, it } from 'vitest';
import { changeForIntent, parseInviteForm, retryMinutes } from './members-form';

describe('changeForIntent', () => {
  it('ánh xạ đúng từng việc', () => {
    expect(changeForIntent('make-owner')).toEqual({ kind: 'role', role: 'owner' });
    expect(changeForIntent('make-staff')).toEqual({ kind: 'role', role: 'staff' });
    expect(changeForIntent('suspend')).toEqual({ kind: 'status', status: 'suspended' });
    expect(changeForIntent('restore')).toEqual({ kind: 'status', status: 'active' });
    expect(changeForIntent('remove')).toEqual({ kind: 'status', status: 'removed' });
  });
  it('giá trị lạ/không phải chuỗi → null (không bao giờ đoán)', () => {
    for (const bad of ['', 'delete', 'make-admin', undefined, null, 5, {}]) {
      expect(changeForIntent(bad)).toBeNull();
    }
  });
});

describe('parseInviteForm', () => {
  it('nhận email hợp lệ + vai trò, cắt khoảng trắng', () => {
    expect(parseInviteForm({ email: '  an@shop.vn ', role: 'staff' })).toEqual({
      ok: true,
      email: 'an@shop.vn',
      role: 'staff',
    });
    expect(parseInviteForm({ email: 'an@shop.vn', role: 'owner' })).toMatchObject({ ok: true });
  });
  it('email sai/rỗng/quá dài → emailInvalid, giữ lại giá trị đã gõ', () => {
    for (const email of [
      '',
      'khong-co-a',
      'a@b',
      'a b@c.d',
      `${'x'.repeat(250)}@a.vn`,
      undefined,
    ]) {
      expect(parseInviteForm({ email, role: 'staff' })).toMatchObject({
        ok: false,
        message: 'emailInvalid',
      });
    }
  });
  it('vai trò lạ → roleInvalid (không nhận admin hay chuỗi bất kỳ)', () => {
    for (const role of ['admin', '', undefined, 'Owner']) {
      expect(parseInviteForm({ email: 'an@shop.vn', role })).toMatchObject({
        ok: false,
        message: 'roleInvalid',
      });
    }
  });
});

describe('retryMinutes', () => {
  it('làm tròn lên, tối thiểu 1', () => {
    expect(retryMinutes(0)).toBe(1);
    expect(retryMinutes(61)).toBe(2);
    expect(retryMinutes(900)).toBe(15);
  });
});
