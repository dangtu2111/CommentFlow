import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canManageSendLock,
  describeSendLock,
  findActiveSendLock,
  isPlatformAdmin,
  PLATFORM_ADMIN_ROLES,
  parseSendLockCommand,
  SEND_LOCK_MAX_MS,
  type SendLock,
  toGateSendLock,
} from './send-lock';

const NOW = new Date('2026-11-06T03:00:00.000Z');
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

const target = { workspaceId: 'ws-1', platform: 'facebook', externalId: 'page-1' } as const;

function lock(over: Partial<SendLock> = {}): SendLock {
  return {
    id: 'lk-1',
    scope: 'workspace',
    workspaceId: 'ws-1',
    channel: null,
    reasonCode: 'abuse',
    note: 'Nhiều câu bị Meta gỡ',
    lockedBy: 'admin-1',
    lockedAt: at(-HOUR),
    until: at(HOUR),
    liftedAt: null,
    ...over,
  };
}
const channelLock = (over: Partial<SendLock> = {}) =>
  lock({
    scope: 'channel',
    channel: { platform: 'facebook', externalId: 'page-1' },
    ...over,
  });

describe('isPlatformAdmin', () => {
  it('chỉ admin / super_admin của nền tảng', () => {
    for (const role of PLATFORM_ADMIN_ROLES) expect(isPlatformAdmin({ id: 'a', role })).toBe(true);
    for (const role of ['owner', 'admin_workspace', 'agent', 'member', '', 'ADMIN'])
      expect(isPlatformAdmin({ id: 'a', role })).toBe(false);
  });

  it('actor hỏng/thiếu → không phải admin (không ném)', () => {
    const bads = [null, undefined, 1, 'admin', {}, { id: '', role: 'admin' }, { role: 'admin' }];
    for (const bad of bads) expect(isPlatformAdmin(bad)).toBe(false);
  });

  it('canManageSendLock: workspace chỉ super; kênh super + support; finance không', () => {
    const a = (role: string) => ({ id: 'a', role });
    expect(canManageSendLock(a('super'), 'workspace')).toBe(true);
    expect(canManageSendLock(a('support'), 'workspace')).toBe(false);
    expect(canManageSendLock(a('finance'), 'workspace')).toBe(false);
    expect(canManageSendLock(a('super'), 'channel')).toBe(true);
    expect(canManageSendLock(a('support'), 'channel')).toBe(true);
    expect(canManageSendLock(a('finance'), 'channel')).toBe(false);
    expect(canManageSendLock(null, 'channel')).toBe(false);
  });

  it('property: vai trò ngoài danh sách luôn bị từ chối', () => {
    fc.assert(
      fc.property(fc.string(), (role) => {
        fc.pre(!(PLATFORM_ADMIN_ROLES as readonly string[]).includes(role));
        expect(isPlatformAdmin({ id: 'x', role })).toBe(false);
      }),
    );
  });
});

describe('parseSendLockCommand', () => {
  const ok = {
    scope: 'workspace',
    workspaceId: 'ws-1',
    reasonCode: 'abuse',
    note: 'Lý do',
    until: at(HOUR).toISOString(),
  };
  const chan = { platform: 'facebook', externalId: 'p1' };

  it('hợp lệ → lệnh đã chuẩn hóa', () => {
    const r = parseSendLockCommand(ok, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.command.until.getTime()).toBe(at(HOUR).getTime());
  });

  it('khóa Page cần channel; khóa workspace không được kèm channel', () => {
    expect(parseSendLockCommand({ ...ok, scope: 'channel' }, NOW).ok).toBe(false);
    expect(parseSendLockCommand({ ...ok, scope: 'channel', channel: chan }, NOW).ok).toBe(true);
    expect(parseSendLockCommand({ ...ok, channel: chan }, NOW).ok).toBe(false);
  });

  it('nền tảng lạ hoặc sai chữ hoa ("Facebook") → từ chối, không tạo khóa vô hiệu', () => {
    for (const platform of ['Facebook', 'fb', ''])
      expect(
        parseSendLockCommand({ ...ok, scope: 'channel', channel: { ...chan, platform } }, NOW).ok,
      ).toBe(false);
  });

  it('thời hạn: phải ở tương lai và ≤ 30 ngày', () => {
    const until = (ms: number) => ({ ...ok, until: at(ms).toISOString() });
    expect(parseSendLockCommand({ ...ok, until: NOW.toISOString() }, NOW).ok).toBe(false);
    expect(parseSendLockCommand(until(-HOUR), NOW).ok).toBe(false);
    expect(parseSendLockCommand(until(SEND_LOCK_MAX_MS), NOW).ok).toBe(true);
    expect(parseSendLockCommand(until(SEND_LOCK_MAX_MS + 1000), NOW).ok).toBe(false);
    expect(parseSendLockCommand({ ...ok, until: undefined }, NOW).ok).toBe(false);
    expect(parseSendLockCommand({ ...ok, until: 'không phải ngày' }, NOW).ok).toBe(false);
  });

  it('lý do lạ / ghi chú rỗng hoặc quá dài → từ chối', () => {
    expect(parseSendLockCommand({ ...ok, reasonCode: 'tùy ý' }, NOW).ok).toBe(false);
    expect(parseSendLockCommand({ ...ok, note: '  ' }, NOW).ok).toBe(false);
    expect(parseSendLockCommand({ ...ok, note: 'x'.repeat(501) }, NOW).ok).toBe(false);
  });

  it('property: không bao giờ ném với đầu vào bất kỳ', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        expect(typeof parseSendLockCommand(raw, NOW).ok).toBe('boolean');
      }),
    );
  });
});

describe('findActiveSendLock', () => {
  it('không có khóa → không chặn', () => {
    expect(findActiveSendLock([], target, NOW)).toEqual({ locked: false });
  });

  it('khóa workspace chặn mọi Page của workspace', () => {
    const s = findActiveSendLock([lock()], { ...target, externalId: 'page-bất-kỳ' }, NOW);
    expect(s).toMatchObject({ locked: true, scope: 'workspace', reasonCode: 'abuse' });
  });

  it('khóa workspace không ảnh hưởng workspace khác', () => {
    expect(findActiveSendLock([lock()], { ...target, workspaceId: 'ws-2' }, NOW).locked).toBe(
      false,
    );
  });

  it('khóa Page theo (platform, externalId) áp XUYÊN workspace', () => {
    const s = findActiveSendLock([channelLock()], { ...target, workspaceId: 'ws-khac' }, NOW);
    expect(s).toMatchObject({ locked: true, scope: 'channel' });
  });

  it('khóa Page không chặn Page khác hay nền tảng khác cùng external_id', () => {
    const other = { ...target, externalId: 'page-2' };
    expect(findActiveSendLock([channelLock()], other, NOW).locked).toBe(false);
    const ig = { ...target, platform: 'instagram' };
    expect(findActiveSendLock([channelLock()], ig, NOW).locked).toBe(false);
  });

  it('hết hạn đúng thời điểm `until` và đã mở khóa → không chặn', () => {
    expect(findActiveSendLock([lock({ until: NOW })], target, NOW).locked).toBe(false);
    expect(findActiveSendLock([lock({ until: at(1) })], target, NOW).locked).toBe(true);
    expect(findActiveSendLock([lock({ liftedAt: at(-1) })], target, NOW).locked).toBe(false);
  });

  it('nhiều khóa → báo khóa hết hạn muộn nhất', () => {
    const s = findActiveSendLock(
      [lock({ id: 'a', until: at(HOUR) }), channelLock({ id: 'b', until: at(5 * HOUR) })],
      target,
      NOW,
    );
    expect(s).toMatchObject({ locked: true, lockId: 'b' });
  });

  it('danh sách/mục không đọc được → coi là đang khóa (thiên về chặn)', () => {
    const bads = [null, undefined, 'x', {}, [{ id: 'x' }], [lock(), { rac: 1 }]];
    for (const bad of bads) {
      expect(findActiveSendLock(bad, target, NOW)).toMatchObject({
        locked: true,
        unreadable: true,
      });
    }
  });

  it('khóa Page thiếu Page (hoặc khóa workspace kèm Page) → không đọc được → chặn', () => {
    const noChannel = lock({ scope: 'channel', channel: null });
    expect(findActiveSendLock([noChannel], target, NOW)).toMatchObject({ unreadable: true });
    const wsWithChannel = lock({ channel: { platform: 'facebook', externalId: 'page-1' } });
    expect(findActiveSendLock([wsWithChannel], target, NOW)).toMatchObject({ unreadable: true });
  });

  it('khóa Page đặt ở workspace khác: không lộ ghi chú; cùng workspace thì có', () => {
    const l = channelLock({ workspaceId: 'ws-goc', note: 'Shop A bán hàng cấm' });
    const other = describeSendLock(findActiveSendLock([l], target, NOW));
    expect(other).not.toContain('Shop A');
    expect(other).toMatch(/tạm khóa gửi/);
    const same = describeSendLock(
      findActiveSendLock([l], { ...target, workspaceId: 'ws-goc' }, NOW),
    );
    expect(same).toContain('Shop A');
  });

  it('chấp nhận hàng có thời điểm dạng chuỗi ISO (đọc từ DB/JSON)', () => {
    const row = { ...lock(), lockedAt: at(-HOUR).toISOString(), until: at(HOUR).toISOString() };
    expect(findActiveSendLock([row], target, NOW).locked).toBe(true);
  });

  it('property: khóa còn hạn của đúng workspace luôn chặn; của workspace khác không bao giờ chặn', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1, max: SEND_LOCK_MAX_MS }),
        (a, b, ahead) => {
          fc.pre(a !== b);
          const l = lock({ workspaceId: a, until: at(ahead) });
          expect(findActiveSendLock([l], { ...target, workspaceId: a }, NOW).locked).toBe(true);
          expect(findActiveSendLock([l], { ...target, workspaceId: b }, NOW).locked).toBe(false);
        },
      ),
    );
  });
});

describe('toGateSendLock', () => {
  it('chuyển trạng thái sang dạng gọn cho cổng/recheck', () => {
    expect(toGateSendLock({ locked: false })).toEqual({ locked: false });
    expect(toGateSendLock(findActiveSendLock([lock()], target, NOW))).toEqual({ locked: true });
    expect(toGateSendLock(findActiveSendLock(null, target, NOW))).toEqual({
      locked: true,
      unreadable: true,
    });
  });
});

describe('describeSendLock', () => {
  it('hiện lý do + thời hạn, không lộ danh tính Admin', () => {
    const s = findActiveSendLock([lock({ lockedBy: 'admin-bi-mat' })], target, NOW);
    const text = describeSendLock(s);
    expect(text).toContain('Nhiều câu bị Meta gỡ');
    expect(text).not.toContain('admin-bi-mat');
    expect(describeSendLock({ locked: false })).toBeNull();
  });

  it('khóa không đọc được → thông điệp chung, không ném', () => {
    expect(describeSendLock(findActiveSendLock(null, target, NOW))).toMatch(/tạm khóa/i);
  });
});
