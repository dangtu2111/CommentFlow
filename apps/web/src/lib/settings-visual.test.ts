import { describe, expect, it } from 'vitest';
import {
  activityTone,
  enrollStep,
  passwordChecks,
  passwordStrength,
  roleTone,
} from './settings-visual';

describe('passwordChecks', () => {
  it('mật khẩu rỗng: không đạt mục nào', () => {
    expect(passwordChecks('')).toEqual({
      length: false,
      mixedCase: false,
      digit: false,
      special: false,
    });
  });
  it('đạt đủ bốn mục', () => {
    expect(passwordChecks('Abcdefg1!x')).toEqual({
      length: true,
      mixedCase: true,
      digit: true,
      special: true,
    });
  });
  it('độ dài tối thiểu lấy theo tham số (đếm ký tự, không đếm byte)', () => {
    expect(passwordChecks('ăăăăă', 5).length).toBe(true);
    expect(passwordChecks('ăăăă', 5).length).toBe(false);
  });
  it('chữ hoa và thường phải có cả hai', () => {
    expect(passwordChecks('abcdefghij').mixedCase).toBe(false);
    expect(passwordChecks('ABCDEFGHIJ').mixedCase).toBe(false);
    expect(passwordChecks('Abcdefghij').mixedCase).toBe(true);
  });
});

describe('passwordStrength', () => {
  it('rỗng → 0, đủ bốn mục → 4', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('Abcdefg1!x')).toBe(4);
  });
  it('đếm số mục đạt', () => {
    expect(passwordStrength('abcdefghij')).toBe(1);
    expect(passwordStrength('abcdefghi1')).toBe(2);
  });
});

describe('enrollStep', () => {
  it('chưa bắt đầu → bước 1; đã có QR → bước 2; đã xác nhận mã → bước 3', () => {
    expect(enrollStep({ begun: false, confirmed: false })).toBe(1);
    expect(enrollStep({ begun: true, confirmed: false })).toBe(2);
    expect(enrollStep({ begun: true, confirmed: true })).toBe(3);
  });
});

describe('activityTone', () => {
  it('nhóm theo tiền tố hành động', () => {
    expect(activityTone('comment.hidden')).toBe('moderation');
    expect(activityTone('comment.unhide_requested')).toBe('moderation');
    expect(activityTone('comment.reply_requested')).toBe('reply');
    expect(activityTone('member.role_changed')).toBe('team');
    expect(activityTone('invitation.created')).toBe('team');
    expect(activityTone('channel.token_cleared')).toBe('channel');
  });
  it('mã lạ → trung tính', () => {
    expect(activityTone('workspace.created')).toBe('neutral');
    expect(activityTone('xyz')).toBe('neutral');
  });
});

describe('roleTone', () => {
  it('owner nổi bật, vai trò khác trung tính', () => {
    expect(roleTone('owner')).toBe('owner');
    expect(roleTone('admin')).toBe('neutral');
    expect(roleTone('staff')).toBe('neutral');
  });
});
