/**
 * FIXTURE (không phải dữ liệu thật): payload webhook `feed` của Facebook Page, mô phỏng theo tài liệu Meta.
 * Tên/ID là giả. Bước kiểm tra tay (docs/testing KT-004, Cloudflare tunnel) xác nhận với webhook thật.
 */
export const PAGE_ID = '1000000000001';
export const POST_ID = `${PAGE_ID}_2000000000002`;
export const COMMENT_ID = '2000000000002_3000000000003';
export const REPLY_ID = '2000000000002_3000000000004';

type ChangeValue = Record<string, unknown>;

export const commentChange = (overrides: ChangeValue = {}) => ({
  field: 'feed',
  value: {
    from: { id: '4000000000004', name: 'Khách Thử' },
    post: { id: POST_ID, status_type: 'added_photos', is_published: true },
    message: 'Áo này còn size M không shop?',
    post_id: POST_ID,
    comment_id: COMMENT_ID,
    created_time: 1_762_000_000,
    item: 'comment',
    parent_id: POST_ID,
    verb: 'add',
    ...overrides,
  },
});

export const webhookBody = (changes: unknown[], pageId = PAGE_ID) => ({
  object: 'page',
  entry: [{ id: pageId, time: 1_762_000_001, changes }],
});
