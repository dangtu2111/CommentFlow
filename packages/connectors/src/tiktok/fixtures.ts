/**
 * Mẫu MẪU của TikTok API for Business (Organic/Accounts: `business/video/list`, `business/comment/list`,
 * `business/comment/reply/list`, `business/comment/reply/create`), VIẾT TAY theo tài liệu công khai (đọc 06/11/2026,
 * CHƯA đối chiếu bằng tài khoản thật — chưa có quyền TikTok, Q5). Tên trường/mã lỗi cần kiểm khi có tài khoản thử.
 * Mọi giá trị là dữ liệu bịa để test; KHÔNG phải kết quả gọi TikTok thật.
 */

export const BUSINESS_ID = 'biz-0001-test';
export const CLIENT_SECRET = 'tiktok-client-secret-not-real';
export const TOKEN = 'act.test-token-not-real-0123456789';
export const VIDEO_ID = '7300000000000000001';
export const COMMENT_ID = '7300000000000000101';
export const REPLY_ID = '7300000000000000102';

const ok = (data: unknown) => ({ code: 0, message: 'OK', request_id: 'req-test', data });

export const tiktokError = (code: number, message = 'error') => ({
  code,
  message,
  request_id: 'req-test',
});

export const VIDEO_LIST = ok({
  videos: [
    { item_id: VIDEO_ID, create_time: 1_762_300_000 },
    { item_id: '7300000000000000002', create_time: 1_762_200_000 },
  ],
  has_more: false,
  cursor: 0,
});

export const COMMENT_LIST_PAGE_1 = ok({
  comments: [
    {
      comment_id: COMMENT_ID,
      video_id: VIDEO_ID,
      user_id: 'user-khach-a',
      username: 'khach_a',
      text: 'Áo này còn size M không shop?',
      create_time: 1_762_300_500,
      owner: false,
    },
    {
      comment_id: '7300000000000000103',
      video_id: VIDEO_ID,
      user_id: BUSINESS_ID,
      username: 'shop',
      text: 'Cảm ơn bạn',
      create_time: 1_762_300_600,
      owner: true,
    },
  ],
  has_more: true,
  cursor: 2,
});

export const COMMENT_LIST_PAGE_2 = ok({
  comments: [
    {
      comment_id: '7300000000000000104',
      video_id: VIDEO_ID,
      user_id: 'user-khach-b',
      username: 'khach_b',
      text: 'cũ rồi',
      create_time: 1_762_000_000,
      owner: false,
    },
    // Thiếu user_id và owner → không khẳng định được tác giả: BỎ (nguyên tắc #5).
    {
      comment_id: '7300000000000000105',
      video_id: VIDEO_ID,
      text: 'ẩn danh',
      create_time: 1_762_300_700,
    },
  ],
  has_more: false,
  cursor: 4,
});

export const REPLY_LIST = ok({
  comments: [
    {
      comment_id: REPLY_ID,
      video_id: VIDEO_ID,
      parent_comment_id: COMMENT_ID,
      user_id: 'user-khach-c',
      username: 'khach_c',
      text: 'mình cũng hỏi',
      create_time: 1_762_300_800,
      owner: false,
    },
  ],
  has_more: false,
  cursor: 1,
});

export const REPLY_CREATED = ok({ comment_id: '7300000000000000199', video_id: VIDEO_ID });
