import { INBOX_PLATFORMS, INBOX_TABS } from '@flow/db/runtime';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildInboxHref,
  DEFAULT_INBOX_TAB,
  encodeInboxCursor,
  INBOX_PLATFORM_KEYS,
  INBOX_TAB_KEYS,
  parseInboxSearchParams,
} from './inbox-filters';

const uuid = '11111111-1111-4111-8111-111111111111';
const cursor = { createdTime: '2026-11-01 08:02:00.123456+00', id: uuid };

describe('FR-040 parseInboxSearchParams — tham số URL của trang Bình luận', () => {
  it('FR-040 không có tham số → mặc định: tab Chờ duyệt, cũ nhất trước, không lọc', () => {
    expect(parseInboxSearchParams({})).toEqual({
      tab: DEFAULT_INBOX_TAB,
      sort: 'oldest',
      cursor: null,
    });
    expect(DEFAULT_INBOX_TAB).toBe('pending_review');
  });

  it('FR-040 đọc đủ tham số hợp lệ', () => {
    const view = parseInboxSearchParams({
      tab: 'needs_human',
      platform: 'instagram',
      channel: uuid,
      ads: '1',
      q: '  giá  ',
      sort: 'newest',
      cursor: encodeInboxCursor(cursor),
    });
    expect(view).toEqual({
      tab: 'needs_human',
      platform: 'instagram',
      channelId: uuid,
      adsOnly: true,
      search: 'giá',
      sort: 'newest',
      cursor,
    });
  });

  it('FR-040 giá trị lạ → bỏ qua và dùng mặc định (không ném lỗi)', () => {
    const view = parseInboxSearchParams({
      tab: 'hack',
      platform: 'zalo',
      channel: 'khong-phai-uuid',
      ads: 'yes',
      sort: 'ngau-nhien',
      cursor: '!!!',
    });
    expect(view).toEqual({ tab: 'pending_review', sort: 'oldest', cursor: null });
  });

  it('FR-040 q cắt tối đa 100 ký tự; rỗng/khoảng trắng → không có search', () => {
    expect(parseInboxSearchParams({ q: 'a'.repeat(500) }).search).toHaveLength(100);
    expect(parseInboxSearchParams({ q: '   ' }).search).toBeUndefined();
  });

  it('FR-040 tham số lặp (mảng) lấy giá trị đầu; cursor sai định dạng bị bỏ', () => {
    expect(parseInboxSearchParams({ tab: ['replied', 'hidden'] }).tab).toBe('replied');
    const bad = Buffer.from(JSON.stringify({ t: "x'; DROP", i: uuid })).toString('base64url');
    expect(parseInboxSearchParams({ cursor: bad }).cursor).toBeNull();
    const notUuid = Buffer.from(JSON.stringify({ t: cursor.createdTime, i: 'x' })).toString(
      'base64url',
    );
    expect(parseInboxSearchParams({ cursor: notUuid }).cursor).toBeNull();
  });

  it('FR-040 thuộc tính: mọi đầu vào bậy đều không ném lỗi và cho kết quả hợp lệ', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom('tab', 'platform', 'channel', 'ads', 'q', 'sort', 'cursor', 'x'),
          fc.oneof(fc.string(), fc.array(fc.string(), { maxLength: 3 }), fc.constant(undefined)),
        ),
        (params) => {
          const view = parseInboxSearchParams(params);
          expect(['oldest', 'newest']).toContain(view.sort);
          expect(view.tab).toBeTruthy();
          expect(view.search === undefined || view.search.length <= 100).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('FR-040 buildInboxHref — dựng lại URL giữ bộ lọc', () => {
  it('FR-040 bỏ tham số bằng giá trị mặc định; giữ các bộ lọc còn lại', () => {
    expect(buildInboxHref({ tab: 'pending_review', sort: 'oldest' })).toBe('/app/comments');
    expect(buildInboxHref({ tab: 'replied', sort: 'oldest' })).toBe('/app/comments?tab=replied');
    const href = buildInboxHref({
      tab: 'all',
      platform: 'facebook',
      channelId: uuid,
      adsOnly: true,
      search: 'giá rẻ & đẹp',
      sort: 'newest',
    });
    const params = new URL(href, 'http://x').searchParams;
    expect(params.get('tab')).toBe('all');
    expect(params.get('platform')).toBe('facebook');
    expect(params.get('channel')).toBe(uuid);
    expect(params.get('ads')).toBe('1');
    expect(params.get('q')).toBe('giá rẻ & đẹp');
    expect(params.get('sort')).toBe('newest');
  });

  it('FR-040 khứ hồi: parse(build(view)) = view (kể cả con trỏ và ký tự đặc biệt trong q)', () => {
    const view = {
      tab: 'send_failed' as const,
      platform: 'tiktok' as const,
      channelId: uuid,
      adsOnly: true,
      search: '100% "ok" <b>&</b>',
      sort: 'newest' as const,
      cursor,
    };
    const url = new URL(buildInboxHref(view), 'http://x');
    const back = parseInboxSearchParams(Object.fromEntries(url.searchParams));
    expect(back).toEqual(view);
  });

  it('FR-040 ghi đè: đổi tab bỏ con trỏ; override undefined xóa bộ lọc', () => {
    const base = parseInboxSearchParams({
      tab: 'all',
      platform: 'facebook',
      cursor: encodeInboxCursor(cursor),
    });
    const next = buildInboxHref(base, { tab: 'replied', cursor: null });
    expect(next).toBe('/app/comments?tab=replied&platform=facebook');
    expect(buildInboxHref(base, { platform: undefined, cursor: null })).toBe(
      '/app/comments?tab=all',
    );
  });
});

describe('FR-040 khớp với tầng truy vấn', () => {
  it('FR-040 danh sách tab/nền tảng ở web trùng với @flow/db (đổi một bên mà quên bên kia sẽ đỏ)', () => {
    expect([...INBOX_TAB_KEYS]).toEqual([...INBOX_TABS]);
    expect([...INBOX_PLATFORM_KEYS]).toEqual([...INBOX_PLATFORMS]);
  });
});

describe('FR-041 bình luận đang chọn (tham số c)', () => {
  it('FR-041 nhận UUID hợp lệ; giá trị lạ bị bỏ', () => {
    expect(parseInboxSearchParams({ c: uuid }).selected).toBe(uuid);
    for (const bad of ['x', '', "1'; DROP", uuid.slice(1), undefined]) {
      expect(parseInboxSearchParams({ c: bad }).selected).toBeUndefined();
    }
  });

  it('FR-041 build giữ c; đổi tab/lọc (override selected: undefined) bỏ c; phân trang giữ c', () => {
    const view = parseInboxSearchParams({ tab: 'all', c: uuid });
    expect(buildInboxHref(view)).toBe(`/app/comments?tab=all&c=${uuid}`);
    expect(buildInboxHref(view, { tab: 'replied', selected: undefined })).toBe(
      '/app/comments?tab=replied',
    );
    expect(buildInboxHref(view, { cursor })).toContain(`c=${uuid}`);
  });

  it('FR-041 khứ hồi có c', () => {
    const view = { tab: 'all' as const, sort: 'oldest' as const, cursor: null, selected: uuid };
    const url = new URL(buildInboxHref(view), 'http://x');
    expect(parseInboxSearchParams(Object.fromEntries(url.searchParams))).toEqual(view);
  });
});

describe('INBOX-LABEL-FILTER — nhãn AI và con trỏ ưu tiên', () => {
  it('nhận nhãn hợp lệ; nhãn lạ bị bỏ qua (không vào truy vấn)', () => {
    expect(parseInboxSearchParams({ label: 'purchase' }).label).toBe('purchase');
    expect(parseInboxSearchParams({ label: 'complaint' }).label).toBe('complaint');
    expect(parseInboxSearchParams({ label: "x'; DROP" }).label).toBeUndefined();
    expect(parseInboxSearchParams({ label: '' }).label).toBeUndefined();
    expect(parseInboxSearchParams({ label: ['spam', 'price'] }).label).toBe('spam');
  });

  it('buildInboxHref giữ nhãn; bỏ nhãn khi xóa; vòng đọc-ghi giữ nguyên', () => {
    const view = parseInboxSearchParams({ label: 'price', tab: 'needs_human' });
    expect(buildInboxHref(view)).toBe('/app/comments?tab=needs_human&label=price');
    expect(buildInboxHref(view, { label: undefined })).toBe('/app/comments?tab=needs_human');
    expect(
      parseInboxSearchParams(
        Object.fromEntries(new URL(buildInboxHref(view), 'http://x').searchParams),
      ),
    ).toEqual(view);
  });

  it('con trỏ mang nhóm ưu tiên (0/1) và đọc lại đúng; nhóm lạ bị bỏ, con trỏ cũ vẫn dùng được', () => {
    const withPriority = { ...cursor, priority: 1 as const };
    expect(parseInboxSearchParams({ cursor: encodeInboxCursor(withPriority) }).cursor).toEqual(
      withPriority,
    );
    expect(
      parseInboxSearchParams({ cursor: encodeInboxCursor({ ...cursor, priority: 0 }) }).cursor,
    ).toEqual({ ...cursor, priority: 0 });
    const odd = Buffer.from(JSON.stringify({ t: cursor.createdTime, i: uuid, p: 7 })).toString(
      'base64url',
    );
    expect(parseInboxSearchParams({ cursor: odd }).cursor).toEqual(cursor);
    expect(parseInboxSearchParams({ cursor: encodeInboxCursor(cursor) }).cursor).toEqual(cursor);
  });
});
