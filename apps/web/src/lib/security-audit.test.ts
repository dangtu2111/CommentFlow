import { describe, expect, it } from 'vitest';
import { actionLabelKey } from './action-log-format';
import { SECURITY_EVENTS, securityAuditEntry } from './security-audit';

describe('FR-001 nhật ký kiểm toán thay đổi bảo mật', () => {
  it('FR-001 mỗi sự kiện thành bản ghi của chính người dùng, mã `security.*`, đối tượng là người dùng', () => {
    for (const event of SECURITY_EVENTS) {
      const entry = securityAuditEntry(event, { workspaceId: 'w1', userId: 'u1' });
      expect(entry).toMatchObject({
        workspaceId: 'w1',
        actorId: 'u1',
        action: `security.${event}`,
        targetType: 'user',
        targetId: 'u1',
      });
    }
  });

  it('FR-001 mọi sự kiện có nhãn dịch ở trang Nhật ký (không hiện mã thô)', () => {
    for (const event of SECURITY_EVENTS) {
      expect(actionLabelKey(`security.${event}`)).toBe(`security_${event}`);
    }
  });

  it('FR-001 chi tiết đi kèm chỉ giữ số liệu không nhạy cảm (không mật khẩu/mã/email)', () => {
    const entry = securityAuditEntry('other_sessions_revoked', {
      workspaceId: 'w1',
      userId: 'u1',
      detail: { removed: 3, password: 'x', code: 'y', email: 'a@b.test', token: 't' },
    });
    expect(entry.after).toEqual({ removed: 3 });
  });
});
