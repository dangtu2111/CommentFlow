import { describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION_SECONDS,
  APP_SESSION_SECONDS,
  adminSessionDeadline,
  capSessionExpiry,
  isSessionPastHardLimit,
  SESSION_UPDATE_AGE_SECONDS,
} from './session-policy';

const now = new Date('2026-11-03T00:00:00.000Z');
const plus = (seconds: number) => new Date(now.getTime() + seconds * 1000);

describe('chính sách phiên (docs/13 §2, ADR 003)', () => {
  it('hằng số: app 14 ngày, Admin 8 giờ, ghi last_seen tối đa 1 lần/giờ', () => {
    expect(APP_SESSION_SECONDS).toBe(14 * 24 * 3600);
    expect(ADMIN_SESSION_SECONDS).toBe(8 * 3600);
    expect(SESSION_UPDATE_AGE_SECONDS).toBe(3600);
  });

  it('phiên app: giữ hạn đã tính nếu không vượt 14 ngày', () => {
    const current = plus(APP_SESSION_SECONDS);
    expect(capSessionExpiry({ expiresAt: current, isAdminSession: false, now })).toEqual(current);
  });

  it('phiên Admin: rút hạn về 8 giờ dù hạn mặc định là 14 ngày', () => {
    const result = capSessionExpiry({
      expiresAt: plus(APP_SESSION_SECONDS),
      isAdminSession: true,
      now,
    });
    expect(result).toEqual(plus(ADMIN_SESSION_SECONDS));
  });

  it('không bao giờ kéo dài hạn: "không nhớ tôi" (1 ngày) vẫn là 1 ngày, kể cả Admin ngắn hơn', () => {
    const oneDay = plus(24 * 3600);
    expect(capSessionExpiry({ expiresAt: oneDay, isAdminSession: false, now })).toEqual(oneDay);
    const twoHours = plus(2 * 3600);
    expect(capSessionExpiry({ expiresAt: twoHours, isAdminSession: true, now })).toEqual(twoHours);
  });

  it('phiên app có hạn quá dài (>14 ngày) bị cắt về 14 ngày', () => {
    expect(
      capSessionExpiry({ expiresAt: plus(APP_SESSION_SECONDS * 3), isAdminSession: false, now }),
    ).toEqual(plus(APP_SESSION_SECONDS));
  });
});

describe('hạn cứng của phiên Admin (tính từ lúc tạo, không bị làm mới kéo dài)', () => {
  const created = new Date('2026-11-03T00:00:00.000Z');

  it('adminSessionDeadline = createdAt + 8 giờ', () => {
    expect(adminSessionDeadline(created)).toEqual(
      new Date(created.getTime() + ADMIN_SESSION_SECONDS * 1000),
    );
  });

  it('phiên Admin quá 8 giờ kể từ lúc tạo là hết hạn cứng; phiên app không bị áp trần này', () => {
    const after9h = new Date(created.getTime() + 9 * 3600 * 1000);
    const after7h = new Date(created.getTime() + 7 * 3600 * 1000);
    expect(isSessionPastHardLimit({ isAdminSession: true, createdAt: created, now: after9h })).toBe(
      true,
    );
    expect(isSessionPastHardLimit({ isAdminSession: true, createdAt: created, now: after7h })).toBe(
      false,
    );
    expect(
      isSessionPastHardLimit({ isAdminSession: false, createdAt: created, now: after9h }),
    ).toBe(false);
  });

  it('chấp nhận createdAt dạng chuỗi ISO', () => {
    expect(
      isSessionPastHardLimit({
        isAdminSession: true,
        createdAt: '2026-11-03T00:00:00.000Z',
        now: new Date('2026-11-03T09:00:00.000Z'),
      }),
    ).toBe(true);
  });
});
