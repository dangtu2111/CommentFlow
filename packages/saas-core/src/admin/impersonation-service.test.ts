import { describe, expect, it } from 'vitest';
import {
  createImpersonationService,
  createInMemoryImpersonation,
  type ImpersonationAuditEntry,
  sanitizePath,
} from './impersonation-service';

const WS = '11111111-1111-4111-8111-111111111111';
const ADMIN = { id: 'a-1', role: 'support' };
const REASON = 'Khách báo lỗi không thấy bình luận';
const MIN = 60_000;

function setup(opts: { auditFails?: (e: ImpersonationAuditEntry) => boolean } = {}) {
  let now = new Date('2026-11-06T10:00:00Z');
  const mem = createInMemoryImpersonation();
  const audit = {
    async write(e: ImpersonationAuditEntry) {
      if (opts.auditFails?.(e)) throw new Error('audit down');
      mem.entries.push(e);
    },
  };
  let n = 0;
  const svc = createImpersonationService({
    store: mem.store,
    audit,
    now: () => now,
    newId: () => `s-${++n}`,
  });
  return {
    svc,
    mem,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe('impersonation service', () => {
  it('start: ghi nhật ký "start" kèm lý do, trả phiên hết hạn ≤ 30 phút', async () => {
    const { svc, mem } = setup();
    const r = await svc.start({ actor: ADMIN, workspaceId: WS, reason: REASON });
    expect(r.ok).toBe(true);
    expect(mem.entries).toHaveLength(1);
    expect(mem.entries[0]).toMatchObject({
      event: 'start',
      adminId: 'a-1',
      workspaceId: WS,
      sessionId: 's-1',
      reason: REASON,
    });
  });

  it('start: thiếu lý do / sai quyền → không tạo phiên, không ghi nhật ký', async () => {
    const { svc, mem } = setup();
    expect(await svc.start({ actor: ADMIN, workspaceId: WS, reason: '' })).toMatchObject({
      ok: false,
      code: 'reason_required',
    });
    expect(
      await svc.start({ actor: { id: 'f', role: 'finance' }, workspaceId: WS, reason: REASON }),
    ).toMatchObject({ ok: false, code: 'forbidden' });
    expect(mem.sessions.size).toBe(0);
    expect(mem.entries).toHaveLength(0);
  });

  it('start: nhật ký lỗi → KHÔNG tạo phiên (fail-closed)', async () => {
    const { svc, mem } = setup({ auditFails: () => true });
    expect(await svc.start({ actor: ADMIN, workspaceId: WS, reason: REASON })).toMatchObject({
      ok: false,
      code: 'audit_failed',
    });
    expect(mem.sessions.size).toBe(0);
  });

  it('access: GET được cho và ghi nhật ký; đường dẫn bị bỏ query (tránh PII)', async () => {
    const { svc, mem } = setup();
    await svc.start({ actor: ADMIN, workspaceId: WS, reason: REASON });
    const r = await svc.access({
      sessionId: 's-1',
      actor: ADMIN,
      workspaceId: WS,
      method: 'GET',
      path: '/inbox?email=a@b.vn&phone=0900000000',
    });
    expect(r).toEqual({ allow: true });
    const last = mem.entries.at(-1);
    expect(last).toMatchObject({ event: 'access', method: 'GET', path: '/inbox' });
    expect(JSON.stringify(last)).not.toContain('a@b.vn');
  });

  it('access: POST bị chặn và vẫn ghi nhật ký "blocked"', async () => {
    const { svc, mem } = setup();
    await svc.start({ actor: ADMIN, workspaceId: WS, reason: REASON });
    const r = await svc.access({
      sessionId: 's-1',
      actor: ADMIN,
      workspaceId: WS,
      method: 'POST',
      path: '/api/replies',
    });
    expect(r).toEqual({ allow: false, code: 'read_only' });
    expect(mem.entries.at(-1)).toMatchObject({
      event: 'blocked',
      code: 'read_only',
      method: 'POST',
    });
  });

  it('access: nhật ký lỗi → không cho xem (fail-closed)', async () => {
    const { svc } = setup({ auditFails: (e) => e.event === 'access' });
    await svc.start({ actor: ADMIN, workspaceId: WS, reason: REASON });
    const r = await svc.access({
      sessionId: 's-1',
      actor: ADMIN,
      workspaceId: WS,
      method: 'GET',
      path: '/inbox',
    });
    expect(r).toEqual({ allow: false, code: 'audit_failed' });
  });

  it('access: sau 30 phút bị chặn, ghi "blocked/expired"', async () => {
    const { svc, mem, advance } = setup();
    await svc.start({ actor: ADMIN, workspaceId: WS, reason: REASON });
    advance(30 * MIN);
    const r = await svc.access({
      sessionId: 's-1',
      actor: ADMIN,
      workspaceId: WS,
      method: 'GET',
      path: '/inbox',
    });
    expect(r).toEqual({ allow: false, code: 'expired' });
    expect(mem.entries.at(-1)).toMatchObject({ event: 'blocked', code: 'expired' });
  });

  it('access: phiên không tồn tại → no_session; vẫn ghi nhật ký', async () => {
    const { svc, mem } = setup();
    const r = await svc.access({
      sessionId: 'zzz',
      actor: ADMIN,
      workspaceId: WS,
      method: 'GET',
      path: '/',
    });
    expect(r).toEqual({ allow: false, code: 'no_session' });
    expect(mem.entries.at(-1)).toMatchObject({ event: 'blocked', code: 'no_session' });
  });

  it('end: chỉ chính admin đó kết thúc; sau end thì mọi request bị chặn', async () => {
    const { svc, mem } = setup();
    await svc.start({ actor: ADMIN, workspaceId: WS, reason: REASON });
    expect(await svc.end({ sessionId: 's-1', adminId: 'a-2' })).toMatchObject({
      ok: false,
      code: 'wrong_admin',
    });
    expect(await svc.end({ sessionId: 's-1', adminId: 'a-1' })).toEqual({ ok: true });
    expect(mem.entries.at(-1)).toMatchObject({ event: 'end', sessionId: 's-1' });
    const r = await svc.access({
      sessionId: 's-1',
      actor: ADMIN,
      workspaceId: WS,
      method: 'GET',
      path: '/',
    });
    expect(r).toEqual({ allow: false, code: 'ended' });
  });

  it('access: hạ vai trò giữa phiên (finance) → chặn forbidden', async () => {
    const { svc, mem } = setup();
    await svc.start({ actor: ADMIN, workspaceId: WS, reason: REASON });
    const r = await svc.access({
      sessionId: 's-1',
      actor: { id: 'a-1', role: 'finance' },
      workspaceId: WS,
      method: 'GET',
      path: '/',
    });
    expect(r).toEqual({ allow: false, code: 'forbidden' });
    expect(mem.entries.at(-1)).toMatchObject({ event: 'blocked', code: 'forbidden' });
  });

  it('access: lỗi store → chặn store_failed (không ném ra ngoài)', async () => {
    const mem = createInMemoryImpersonation();
    const svc = createImpersonationService({
      store: {
        ...mem.store,
        get: async () => {
          throw new Error('db down');
        },
      },
      audit: { write: async () => undefined },
      now: () => new Date('2026-11-06T10:00:00Z'),
      newId: () => 's-1',
    });
    const r = await svc.access({
      sessionId: 's-1',
      actor: ADMIN,
      workspaceId: WS,
      method: 'GET',
      path: '/',
    });
    expect(r).toEqual({ allow: false, code: 'store_failed' });
  });

  it('access: workspaceId không phải uuid → chặn, không ghi rác vào nhật ký', async () => {
    const { svc, mem } = setup();
    await svc.start({ actor: ADMIN, workspaceId: WS, reason: REASON });
    const before = mem.entries.length;
    const r = await svc.access({
      sessionId: 's-1',
      actor: ADMIN,
      workspaceId: 'not-a-uuid',
      method: 'GET',
      path: '/',
    });
    expect(r).toEqual({ allow: false, code: 'wrong_workspace' });
    expect(mem.entries).toHaveLength(before);
  });

  it('sanitizePath: che email và dãy số dài trong đường dẫn', () => {
    expect(sanitizePath('/customers/0900000000/a@b.vn?x=1')).toBe('/customers/[số]/[email]');
  });

  it('end: phiên không có → no_session', async () => {
    const { svc } = setup();
    expect(await svc.end({ sessionId: 'zzz', adminId: 'a-1' })).toMatchObject({
      ok: false,
      code: 'no_session',
    });
  });
});
