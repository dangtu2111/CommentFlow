import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_BASE_PATH,
  buildActivityHref,
  encodeActivityCursor,
  parseActivitySearchParams,
} from './action-log-filters';

const id = '3f2b8c1e-5a4d-4b7e-9c10-0a1b2c3d4e5f';

describe('FR-092 tham số URL trang Nhật ký', () => {
  it('FR-092 không tham số thì không lọc', () => {
    expect(parseActivitySearchParams({})).toEqual({ cursor: null });
  });

  it('FR-092 nhận giá trị hợp lệ, bỏ giá trị lạ (sửa URL tay không gây lỗi)', () => {
    const view = parseActivitySearchParams({
      actor: 'ai',
      action: ' member.role_changed ',
      from: '2026-11-01',
      to: '2026-11-30',
      l: id,
    });
    expect(view).toEqual({
      actorType: 'ai',
      action: 'member.role_changed',
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      selected: id,
      cursor: null,
    });
    expect(
      parseActivitySearchParams({
        actor: 'root',
        from: '2026-13-45',
        to: 'abc',
        l: 'x',
        action: 'a'.repeat(300),
      }),
    ).toEqual({ cursor: null });
  });

  it('FR-092 ngày không có thật (30/02) bị bỏ', () => {
    expect(parseActivitySearchParams({ from: '2026-02-30' })).toEqual({ cursor: null });
  });

  it('FR-092 con trỏ mã hóa rồi giải mã đúng; con trỏ hỏng bị bỏ', () => {
    const cursor = { createdAt: '2026-11-01 08:00:00.123456+00', id };
    const encoded = encodeActivityCursor(cursor);
    expect(parseActivitySearchParams({ cursor: encoded }).cursor).toEqual(cursor);
    expect(parseActivitySearchParams({ cursor: 'rác' }).cursor).toBeNull();
  });

  it('FR-092 dựng đường dẫn: bỏ tham số rỗng, ghi đè, xóa bộ lọc bằng undefined', () => {
    expect(buildActivityHref({ cursor: null })).toBe(ACTIVITY_BASE_PATH);
    expect(buildActivityHref({ actorType: 'user', cursor: null }, { selected: id })).toBe(
      `${ACTIVITY_BASE_PATH}?actor=user&l=${id}`,
    );
    expect(buildActivityHref({ actorType: 'user', cursor: null }, { actorType: undefined })).toBe(
      ACTIVITY_BASE_PATH,
    );
  });
});
