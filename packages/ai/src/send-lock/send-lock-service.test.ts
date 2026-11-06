import { describe, expect, it } from 'vitest';
import { createInMemorySendLock, createSendLockService } from './send-lock-service';

const NOW = new Date('2026-11-06T03:00:00.000Z');
const HOUR = 3_600_000;
const admin = { id: 'admin-1', role: 'super' };
const support = { id: 'sup-1', role: 'support' };
const finance = { id: 'fin-1', role: 'finance' };
const owner = { id: 'u-1', role: 'owner' };
const cmd = {
  scope: 'channel',
  workspaceId: 'ws-1',
  channel: { platform: 'facebook', externalId: 'page-1' },
  reasonCode: 'abuse',
  note: 'Bị Meta cảnh báo',
  until: new Date(NOW.getTime() + HOUR).toISOString(),
};
const target = { workspaceId: 'ws-2', platform: 'facebook', externalId: 'page-1' } as const;

function make() {
  let n = 0;
  return createInMemorySendLock({ now: () => NOW, newId: () => `lk-${++n}` });
}

describe('send-lock service', () => {
  it('Admin khóa → trạng thái khóa xuyên workspace, ghi nhật ký, báo Owner một lần', async () => {
    const s = make();
    const r = await s.service.lock(admin, cmd);
    expect(r).toMatchObject({ ok: true });
    expect(await s.service.statusFor(target)).toMatchObject({ locked: true, scope: 'channel' });
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ action: 'lock', actorId: 'admin-1', workspaceId: 'ws-1' });
    expect(s.notices).toEqual([expect.objectContaining({ workspaceId: 'ws-1', kind: 'locked' })]);
  });

  it('Owner / vai trò lạ không khóa được và không để lại dấu vết', async () => {
    const s = make();
    for (const actor of [owner, { id: 'x', role: 'admin' }, finance, null]) {
      expect(await s.service.lock(actor, cmd)).toEqual({ ok: false, code: 'forbidden' });
    }
    expect(s.audit).toHaveLength(0);
    expect(s.notices).toHaveLength(0);
    expect((await s.service.statusFor(target)).locked).toBe(false);
  });

  it('phân quyền theo phạm vi (docs/13 §3.2): Support chỉ khóa/mở khóa theo kênh, không đụng khóa workspace', async () => {
    const s = make();
    expect(await s.service.lock(support, cmd)).toMatchObject({ ok: true });
    const { channel: _omit, ...rest } = cmd;
    const wsCmd = { ...rest, scope: 'workspace' };
    expect(await s.service.lock(support, wsCmd)).toEqual({ ok: false, code: 'forbidden' });
    expect(await s.service.lock(admin, wsCmd)).toMatchObject({ ok: true });
    expect(await s.service.lift(support, 'lk-2')).toEqual({ ok: false, code: 'forbidden' });
    expect(await s.service.lift(finance, 'lk-1')).toEqual({ ok: false, code: 'forbidden' });
    expect(await s.service.lift(support, 'lk-1')).toMatchObject({ ok: true });
  });

  it('nhật ký ghi đủ phạm vi, Page, lý do, thời hạn', async () => {
    const s = make();
    await s.service.lock(admin, cmd);
    expect(s.audit[0]).toMatchObject({
      scope: 'channel',
      channel: { platform: 'facebook', externalId: 'page-1' },
      reasonCode: 'abuse',
      until: new Date(cmd.until),
    });
  });

  it('lệnh hỏng → invalid, không ghi', async () => {
    const s = make();
    expect(await s.service.lock(admin, { ...cmd, until: undefined })).toEqual({
      ok: false,
      code: 'invalid',
    });
    expect(s.audit).toHaveLength(0);
  });

  it('Admin mở khóa → hết chặn; Owner không mở được; mở lại lần hai không nhân đôi hiệu ứng', async () => {
    const s = make();
    await s.service.lock(admin, cmd);
    expect(await s.service.lift(owner, 'lk-1')).toEqual({ ok: false, code: 'forbidden' });
    expect((await s.service.statusFor(target)).locked).toBe(true);
    expect(await s.service.lift(admin, 'lk-1')).toMatchObject({ ok: true });
    expect((await s.service.statusFor(target)).locked).toBe(false);
    expect(await s.service.lift(admin, 'lk-1')).toMatchObject({ ok: true });
    expect(s.audit.map((a) => a.action)).toEqual(['lock', 'lift']);
    expect(s.notices.map((x) => x.kind)).toEqual(['locked', 'lifted']);
    expect(await s.service.lift(admin, 'không-có')).toEqual({ ok: false, code: 'not_found' });
  });

  it('nguồn lưu trữ lỗi khi đọc → chặn (không mở)', async () => {
    const s = make();
    s.failReads(true);
    expect(await s.service.statusFor(target)).toMatchObject({ locked: true, unreadable: true });
  });

  it('khóa bị xóa giữa lúc mở (đua) → not_found, không ghi nhật ký', async () => {
    const s = make();
    await s.service.lock(admin, cmd);
    const racing = createSendLockService({
      store: { ...s.store, markLifted: async () => null },
      effects: { audit: async () => undefined, notifyOwner: async () => undefined },
      now: () => NOW,
      newId: () => 'x',
    });
    expect(await racing.lift(admin, 'lk-1')).toEqual({ ok: false, code: 'not_found' });
    expect(await s.store.markLifted('không-có', NOW)).toBeNull();
    expect(s.audit.map((a) => a.action)).toEqual(['lock']);
  });

  it('báo Owner lỗi không làm mất khóa', async () => {
    const s = make();
    s.failNotify(true);
    expect(await s.service.lock(admin, cmd)).toMatchObject({ ok: true });
    expect((await s.service.statusFor(target)).locked).toBe(true);
  });
});
