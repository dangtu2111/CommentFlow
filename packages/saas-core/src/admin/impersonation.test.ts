import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  authorizeImpersonatedRequest,
  canImpersonate,
  IMPERSONATION_MAX_MS,
  IMPERSONATION_REASON_MIN,
  type ImpersonationSession,
  parseStartImpersonation,
  sessionState,
} from './impersonation';

const T0 = new Date('2026-11-06T10:00:00Z');
const MIN = 60_000;
const ADMIN = { id: 'a-1', role: 'support' };
const WS = '11111111-1111-4111-8111-111111111111';
const REASON = 'Khách báo lỗi không thấy bình luận';

const session = (over: Partial<ImpersonationSession> = {}): ImpersonationSession => ({
  id: 's-1',
  adminId: 'a-1',
  workspaceId: WS,
  reason: REASON,
  startedAt: T0,
  expiresAt: new Date(T0.getTime() + 30 * MIN),
  endedAt: null,
  ...over,
});

describe('canImpersonate', () => {
  it.each([
    ['super', true],
    ['support', true],
    ['finance', false],
    ['owner', false],
    ['', false],
  ])('vai trò %s → %s', (role, ok) => {
    expect(canImpersonate({ id: 'x', role })).toBe(ok);
  });
  it('actor hỏng → false', () => {
    expect(canImpersonate(null)).toBe(false);
    expect(canImpersonate({ role: 'super' })).toBe(false);
  });
});

describe('parseStartImpersonation', () => {
  const base = { actor: ADMIN, workspaceId: WS, reason: REASON, now: T0 };
  it('hợp lệ → hết hạn mặc định đúng 30 phút', () => {
    const r = parseStartImpersonation(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.expiresAt.getTime() - T0.getTime()).toBe(IMPERSONATION_MAX_MS);
  });
  it('lý do thiếu/ngắn/toàn khoảng trắng → reason_required', () => {
    for (const reason of ['', '   ', 'x'.repeat(IMPERSONATION_REASON_MIN - 1), undefined]) {
      expect(parseStartImpersonation({ ...base, reason })).toMatchObject({
        ok: false,
        code: 'reason_required',
      });
    }
  });
  it('lý do quá dài → từ chối', () => {
    expect(parseStartImpersonation({ ...base, reason: 'x'.repeat(501) })).toMatchObject({
      ok: false,
      code: 'reason_required',
    });
  });
  it('Finance/không phải admin → forbidden', () => {
    expect(parseStartImpersonation({ ...base, actor: { id: 'a', role: 'finance' } })).toMatchObject(
      { ok: false, code: 'forbidden' },
    );
  });
  it('workspaceId không phải uuid → invalid_target', () => {
    expect(parseStartImpersonation({ ...base, workspaceId: 'abc' })).toMatchObject({
      ok: false,
      code: 'invalid_target',
    });
  });
  it('ttl dài hơn 30 phút bị kẹp; ttl ≤ 0/NaN → invalid_ttl', () => {
    const r = parseStartImpersonation({ ...base, ttlMs: 10 * IMPERSONATION_MAX_MS });
    expect(r.ok && r.value.expiresAt.getTime() - T0.getTime()).toBe(IMPERSONATION_MAX_MS);
    const short = parseStartImpersonation({ ...base, ttlMs: 5 * MIN });
    expect(short.ok && short.value.expiresAt.getTime() - T0.getTime()).toBe(5 * MIN);
    for (const ttlMs of [0, -1, Number.NaN]) {
      expect(parseStartImpersonation({ ...base, ttlMs })).toMatchObject({
        ok: false,
        code: 'invalid_ttl',
      });
    }
  });
});

describe('sessionState', () => {
  it('đang hiệu lực / hết hạn đúng mốc / đã kết thúc', () => {
    expect(sessionState(session(), T0)).toBe('active');
    expect(sessionState(session(), new Date(T0.getTime() + 30 * MIN - 1))).toBe('active');
    expect(sessionState(session(), new Date(T0.getTime() + 30 * MIN))).toBe('expired');
    expect(sessionState(session({ endedAt: T0 }), T0)).toBe('ended');
  });
  it('phiên sống > 30 phút hoặc dữ liệu hỏng → invalid (thiên về chặn)', () => {
    expect(sessionState(session({ expiresAt: new Date(T0.getTime() + 31 * MIN) }), T0)).toBe(
      'invalid',
    );
    expect(sessionState(session(), new Date(T0.getTime() - 1))).toBe('invalid');
    expect(sessionState({ junk: true }, T0)).toBe('invalid');
    expect(sessionState(null, T0)).toBe('invalid');
    expect(sessionState(session({ expiresAt: new Date('x') }), T0)).toBe('invalid');
  });
});

describe('authorizeImpersonatedRequest — chặn mọi thao tác ghi', () => {
  const req = (method: string, over: Record<string, unknown> = {}) =>
    authorizeImpersonatedRequest({
      session: session(),
      adminId: 'a-1',
      workspaceId: WS,
      method,
      now: T0,
      ...over,
    });
  it.each(['GET', 'HEAD', 'get'])('%s → cho', (m) => {
    expect(req(m)).toEqual({ allow: true });
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'FOO', ''])(
    '%s → chặn read_only',
    (m) => {
      expect(req(m)).toMatchObject({ allow: false, code: 'read_only' });
    },
  );
  it('hết hạn / đã kết thúc → chặn kể cả GET', () => {
    expect(req('GET', { now: new Date(T0.getTime() + 31 * MIN) })).toMatchObject({
      allow: false,
      code: 'expired',
    });
    expect(req('GET', { session: session({ endedAt: T0 }) })).toMatchObject({
      allow: false,
      code: 'ended',
    });
  });
  it('sai admin hoặc sai workspace → chặn', () => {
    expect(req('GET', { adminId: 'a-2' })).toMatchObject({ allow: false, code: 'wrong_admin' });
    expect(req('GET', { workspaceId: '22222222-2222-4222-8222-222222222222' })).toMatchObject({
      allow: false,
      code: 'wrong_workspace',
    });
  });
  it('không có phiên → chặn', () => {
    expect(req('GET', { session: null })).toMatchObject({ allow: false, code: 'no_session' });
  });
  it('PROPERTY: phương thức không an toàn không bao giờ được cho', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: -1, max: 60 }), (method, offsetMin) => {
        const r = req(method, { now: new Date(T0.getTime() + offsetMin * MIN) });
        if (r.allow) expect(['GET', 'HEAD']).toContain(method.toUpperCase());
      }),
    );
  });
  it('PROPERTY: không bao giờ cho từ mốc hết hạn trở đi', () => {
    fc.assert(
      fc.property(fc.integer({ min: 30 * MIN, max: 10 ** 9 }), (off) => {
        expect(req('GET', { now: new Date(T0.getTime() + off) }).allow).toBe(false);
      }),
    );
  });
});
