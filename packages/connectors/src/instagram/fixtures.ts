/**
 * Mẫu MẪU của Instagram Graph API, VIẾT TAY theo tài liệu chính thức của Meta (Instagram API with Facebook Login:
 * IG Comment, IG Media Comments, IG Comment Replies, Webhooks `comments`; đọc 06/11/2026). KHÔNG phải kết quả gọi Meta
 * thật (chưa có tài khoản IG Business thử) — mọi giá trị là dữ liệu bịa để test.
 */

export const IG_ID = '17841400000000001';
export const APP_ID = '2000000000002';
export const APP_SECRET = 'test-app-secret-not-real';
export const TOKEN = 'EAAB-test-token-not-real-0123456789';
export const MEDIA_ID = '17900000000000001';
export const COMMENT_ID = '17800000000000001';
export const REPLY_ID = '17800000000000002';

/** Nguồn: reference/ig-comment/replies — tạo trả lời, phản hồi `{"id": "<id>"}`. */
export const REPLY_CREATED = { id: '17800000000000099' };
/** Nguồn: reference/ig-comment — cập nhật `hide`, phản hồi `{"success": true}`. */
export const SUCCESS_TRUE = { success: true };

/** Nguồn: reference/ig-media/comments — danh sách bình luận cấp 1 (`timestamp` ISO, `username`, `replies`). */
export const MEDIA_COMMENTS = {
  data: [
    {
      id: COMMENT_ID,
      text: 'Áo này còn size M không shop?',
      timestamp: '2026-11-05T03:00:00+0000',
      username: 'khach_a',
      from: { id: '17841411111111111', username: 'khach_a' },
    },
    {
      id: '17800000000000003',
      text: 'cũ rồi',
      timestamp: '2026-11-01T03:00:00+0000',
      username: 'khach_b',
    },
  ],
  paging: { cursors: { before: 'b1', after: 'a1' } },
};

/** Nguồn: reference/ig-comment/replies — trả lời của một bình luận (`parent_id` = bình luận cha). */
export const COMMENT_REPLIES = {
  data: [
    {
      id: REPLY_ID,
      text: 'Còn nhé bạn',
      timestamp: '2026-11-05T03:05:00+0000',
      username: 'shop_demo',
      from: { id: IG_ID, username: 'shop_demo' },
      parent_id: COMMENT_ID,
    },
  ],
};

/** Nguồn: reference/ig-user/media — media của tài khoản. */
export const USER_MEDIA = {
  data: [
    { id: MEDIA_ID, timestamp: '2026-11-04T00:00:00+0000' },
    { id: '17900000000000002', timestamp: '2026-10-01T00:00:00+0000' },
  ],
};

/** Nguồn: webhooks/reference/instagram — field `comments` (không có thời điểm tạo → dùng `entry.time`, giây). */
export const WEBHOOK_COMMENT = {
  object: 'instagram',
  entry: [
    {
      id: IG_ID,
      time: 1_762_311_600,
      changes: [
        {
          field: 'comments',
          value: {
            from: { id: '17841411111111111', username: 'khach_a' },
            media: { id: MEDIA_ID, media_product_type: 'FEED' },
            id: COMMENT_ID,
            text: 'Áo này còn size M không shop?',
          },
        },
      ],
    },
  ],
};

export const graphError = (code: number) => ({
  error: { message: 'x', type: 'OAuthException', code, fbtrace_id: 'T' },
});
