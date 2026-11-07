import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_AUDIT_DETAIL_MAX_BYTES,
  ADMIN_SESSION_MAX_MS,
  canRecordAdminAction,
  canViewAdminAudit,
  evaluateAdminSession,
  parseAdminAuditInput,
} from './admin-audit';

const HOUR = 3_600_000;
const now = new Date('2026-11-06T10:00:00Z');
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
const session = (over: Partial<Parameters<typeof evaluateAdminSession>[0]> = {}) => ({
  isAdminSession: true,
  createdAt: at(-HOUR),
  expiresAt: at(HOUR),
  now,
  ...over,
});

describe('AUTH-ADMIN-SESSION evaluateAdminSession (FR-100)', () => {
  it('phiên Admin còn hạn → valid', () => {
    expect(evaluateAdminSession(session())).toBe('valid');
  });
  it('phiên thường → not_admin_session', () => {
    expect(evaluateAdminSession(session({ isAdminSession: false }))).toBe('not_admin_session');
  });
  it('đúng thời điểm hết hạn → expired (biên)', () => {
    expect(evaluateAdminSession(session({ expiresAt: now }))).toBe('expired');
    expect(evaluateAdminSession(session({ expiresAt: at(1) }))).toBe('valid');
  });
  it('quá 8 giờ kể từ lúc tạo → expired dù expiresAt còn xa (lớp thứ hai)', () => {
    const createdAt = at(-ADMIN_SESSION_MAX_MS);
    expect(evaluateAdminSession(session({ createdAt, expiresAt: at(10 * HOUR) }))).toBe('expired');
    expect(evaluateAdminSession(session({ createdAt: at(-ADMIN_SESSION_MAX_MS + 1) }))).toBe(
      'valid',
    );
  });
  it('mốc không hợp lệ / tạo ở tương lai / hạn trước lúc tạo → invalid', () => {
    expect(evaluateAdminSession(session({ createdAt: new Date(Number.NaN) }))).toBe('invalid');
    expect(evaluateAdminSession(session({ expiresAt: new Date(Number.NaN) }))).toBe('invalid');
    expect(evaluateAdminSession(session({ createdAt: at(HOUR), expiresAt: at(2 * HOUR) }))).toBe(
      'invalid',
    );
    expect(evaluateAdminSession(session({ createdAt: at(-HOUR), expiresAt: at(-2 * HOUR) }))).toBe(
      'invalid',
    );
  });
  it('property: không bao giờ valid khi đã quá 8 giờ từ lúc tạo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: ADMIN_SESSION_MAX_MS, max: 100 * HOUR }),
        fc.integer({ min: 1, max: 1000 * HOUR }),
        (age, ttl) => {
          const r = evaluateAdminSession(
            session({ createdAt: at(-age), expiresAt: at(ttl), isAdminSession: true }),
          );
          expect(r).not.toBe('valid');
        },
      ),
    );
  });
});

describe('FR-100 quyền Admin', () => {
  it('chỉ Super Admin xem nhật ký (docs/13 §3.2); mọi giá trị lạ → từ chối', () => {
    expect(canViewAdminAudit({ isAdmin: true, adminRole: 'super' })).toBe(true);
    for (const adminRole of ['support', 'finance', null, undefined, '', 'SUPER', 'owner']) {
      expect(canViewAdminAudit({ isAdmin: true, adminRole })).toBe(false);
    }
    expect(canViewAdminAudit({ isAdmin: false, adminRole: 'super' })).toBe(false);
  });
  it('mọi vai trò Admin ghi được thao tác; người thường thì không', () => {
    for (const adminRole of ['super', 'support', 'finance']) {
      expect(canRecordAdminAction({ isAdmin: true, adminRole })).toBe(true);
    }
    expect(canRecordAdminAction({ isAdmin: true, adminRole: null })).toBe(false);
    expect(canRecordAdminAction({ isAdmin: false, adminRole: 'super' })).toBe(false);
  });
});

describe('FR-100 parseAdminAuditInput', () => {
  const base = { action: 'workspace.suspend', targetType: 'workspace', targetId: 'ws-1' };

  it('chấp nhận đầu vào hợp lệ, detail mặc định rỗng', () => {
    const r = parseAdminAuditInput(base);
    expect(r).toMatchObject({ ...base, targetWorkspaceId: null, detail: {} });
  });
  it.each(['', 'A.b', 'x', '1abc', 'có dấu', 'a'.repeat(65), 'a b'])(
    'từ chối action %j',
    (action) => {
      expect(() => parseAdminAuditInput({ ...base, action })).toThrow();
    },
  );
  it('targetWorkspaceId phải là uuid', () => {
    expect(() => parseAdminAuditInput({ ...base, targetWorkspaceId: 'abc' })).toThrow();
    const id = '5f0c1a9e-2b3d-4c5e-8f70-123456789abc';
    expect(parseAdminAuditInput({ ...base, targetWorkspaceId: id }).targetWorkspaceId).toBe(id);
  });
  it('che email/SĐT/chuỗi giống token trong detail và chỉ giữ giá trị nguyên thủy', () => {
    const blob = 'z'.repeat(40);
    const r = parseAdminAuditInput({
      ...base,
      detail: { reason: `gọi 0912345678 hoặc a@b.vn ${blob}`, days: 7, ok: true, none: null },
    });
    const text = JSON.stringify(r.detail);
    expect(text).not.toContain('0912345678');
    expect(text).not.toContain('a@b.vn');
    expect(text).not.toContain(blob);
    expect(r.detail.days).toBe(7);
    expect(r.detail.ok).toBe(true);
  });
  it('giá trị của khóa nhạy cảm luôn bị thay, không lưu', () => {
    const r = parseAdminAuditInput({
      ...base,
      detail: { password: 'abc', apiToken: 'abc', client_secret: 'abc', otp: '123456' },
    });
    for (const value of Object.values(r.detail)) expect(value).toBe('[đã che]');
  });
  it('từ chối detail lồng nhau, mảng, quá nhiều khóa, quá lớn', () => {
    expect(() => parseAdminAuditInput({ ...base, detail: { a: { b: 1 } } })).toThrow();
    expect(() => parseAdminAuditInput({ ...base, detail: [1] })).toThrow();
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 1]));
    expect(() => parseAdminAuditInput({ ...base, detail: many })).toThrow();
    const big = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`k${i}`, 'ab '.repeat(63)]),
    );
    expect(() => parseAdminAuditInput({ ...base, detail: big })).toThrow();
  });
  it('property: detail đầu ra luôn ≤ giới hạn byte và không chứa email thô', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/), fc.string({ maxLength: 120 }), {
          maxKeys: 8,
        }),
        (detail) => {
          const r = parseAdminAuditInput({ ...base, detail });
          expect(new TextEncoder().encode(JSON.stringify(r.detail)).length).toBeLessThanOrEqual(
            ADMIN_AUDIT_DETAIL_MAX_BYTES,
          );
          // Cùng định nghĩa "email" với `maskPii` (pii.ts): đuôi miền phải là ≥ 2 CHỮ CÁI. Regex cũ chấp nhận đuôi toàn số
          // nên fast-check tìm ra "+@0.0" (không phải email) làm test chập chờn theo hạt ngẫu nhiên.
          expect(JSON.stringify(r.detail)).not.toMatch(
            /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
          );
        },
      ),
    );
  });
});
