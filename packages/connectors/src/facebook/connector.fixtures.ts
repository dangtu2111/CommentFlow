/**
 * Phản hồi HTTP MẪU của Graph API, VIẾT TAY theo tài liệu chính thức của Meta (đọc 06/11/2026). KHÔNG phải kết quả
 * gọi Meta thật (chưa có Page/token) — mọi giá trị là dữ liệu bịa để test; chưa từng đối chiếu với Page thật (KT cần Page).
 * Nguồn mỗi mẫu ghi ngay trên mẫu; tổng hợp ở docs/decisions/010-facebook-connector.md.
 */

export const PAGE_ID = '1000000000001';
export const APP_ID = '2000000000002';
export const APP_SECRET = 'test-app-secret-not-real';
export const TOKEN = 'EAAB-test-token-not-real-0123456789';

/** Nguồn: https://developers.facebook.com/docs/graph-api/reference/object/comments/ (Creating → Response `{"id": "{comment-id}"}`). */
export const REPLY_CREATED = { id: '3000000000003_4000000000004' };

/** Nguồn: https://developers.facebook.com/docs/graph-api/reference/comment/ (Updating → Response `{ success: bool }`). */
export const SUCCESS_TRUE = { success: true };
export const SUCCESS_FALSE = { success: false };

/**
 * Nguồn: https://developers.facebook.com/docs/graph-api/guides/error-handling/ (dạng `error`: message, type, code,
 * error_subcode, fbtrace_id). Chuỗi `message` là chuỗi bịa; có cố ý chèn nội dung giống bình luận để kiểm không lọt ra.
 */
export const graphError = (
  code: number,
  options: { subcode?: number; message?: string; type?: string } = {},
) => ({
  error: {
    message: options.message ?? `(#${code}) Thông báo lỗi mẫu`,
    type: options.type ?? 'OAuthException',
    code,
    ...(options.subcode === undefined ? {} : { error_subcode: options.subcode }),
    fbtrace_id: 'AbCdEfGhIjK',
  },
});

/**
 * Nguồn: https://developers.facebook.com/docs/graph-api/overview/rate-limiting/ (X-Business-Use-Case-Usage: khóa
 * `type`, `call_count`, `total_cputime`, `total_time`, `estimated_time_to_regain_access` tính bằng PHÚT).
 */
export const BUC_HEADER = JSON.stringify({
  [PAGE_ID]: [
    {
      type: 'pages',
      call_count: 100,
      total_cputime: 25,
      total_time: 25,
      estimated_time_to_regain_access: 5,
    },
  ],
});

/** Nguồn: https://developers.facebook.com/docs/graph-api/overview/rate-limiting/ (X-App-Usage: không có thời gian chờ). */
export const APP_USAGE_HEADER = JSON.stringify({
  call_count: 28,
  total_time: 25,
  total_cputime: 25,
});

/**
 * Nguồn: reference/object/comments (mảng Comment + `paging.cursors.before/after` + `paging.next` khi còn trang);
 * trường Comment: id, from, message, created_time, parent (reference/comment, bản v17/v27 qua tìm kiếm).
 */
export const REPLIES_PAGE_1 = {
  data: [
    {
      id: '3000000000003_4000000000010',
      message: 'Cảm ơn bạn',
      created_time: '2026-11-05T03:00:00+0000',
      from: { id: PAGE_ID, name: 'Shop Mẫu' },
      parent: { id: '3000000000003_4000000000001' },
    },
    {
      id: '3000000000003_4000000000011',
      message: 'Giá bao nhiêu?',
      created_time: '2026-11-05T03:01:00+0000',
      from: { id: '5000000000005', name: 'Khách Mẫu' },
    },
  ],
  paging: {
    cursors: { before: 'BEFORE1', after: 'AFTER1' },
    next: `https://graph.facebook.com/v27.0/3000000000003_4000000000001/comments?access_token=LEAK&after=AFTER1`,
  },
};

/** Trang cuối: không có `paging.next`. */
export const REPLIES_PAGE_2 = {
  data: [
    {
      id: '3000000000003_4000000000012',
      message: 'Dạ shop báo giá nhé',
      created_time: '2026-11-05T03:02:00+0000',
      from: { id: PAGE_ID, name: 'Shop Mẫu' },
    },
  ],
  paging: { cursors: { before: 'BEFORE2', after: 'AFTER2' } },
};

/** Nguồn: reference/object/comments (`data` rỗng khi hết/không có). */
export const EMPTY_PAGE = { data: [] };

/**
 * Nguồn: reference/page/subscribed_apps (GET: `data` gồm các Application kèm `subscribed_fields`; POST: `{ success }`).
 * Chỉ dùng `id` và `subscribed_fields` (tài liệu không nêu rõ `id`/`name` — id là của Application node).
 */
export const SUBSCRIBED_APPS = {
  data: [
    { id: '9999999999999', name: 'Ứng dụng khác', subscribed_fields: ['messages'] },
    { id: APP_ID, name: 'CommentFlow', subscribed_fields: ['feed'] },
  ],
};
export const SUBSCRIBED_APPS_NONE = { data: [] };
