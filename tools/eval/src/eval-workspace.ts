/**
 * Workspace dành riêng cho EVAL-RUNNER khi ghi `ai_usage` thật (`--persist-usage`, chỉ `cf_dev`). CỐ ĐỊNH: mọi lần chạy dùng lại
 * đúng workspace này (tạo nếu chưa có) thay vì sinh một workspace `[EVAL]` mới mỗi lần (đã từng tạo 4 workspace rỗng). Không dính tới
 * workspace của người dùng/shop thật.
 */
export const EVAL_WORKSPACE = {
  id: '00000000-0000-4000-8000-00000000e7a1',
  name: '[EVAL] chạy đánh giá',
  slug: 'eval-runner',
} as const;
