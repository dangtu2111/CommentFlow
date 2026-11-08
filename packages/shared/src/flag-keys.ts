/**
 * Khóa feature flag (docs/09 §10) dùng ở nhiều gói. Giá trị mặc định khai báo trong mã (`FLAG_DEFAULTS`) dùng khi cờ chưa có hàng trong DB hoặc
 * không đọc được DB — mọi cờ AI mặc định TẮT. Ghi cờ: `pnpm flags:set` (dev/test/ci); staging/production qua trang Admin (ADMIN-FLAGS-PAGE).
 */
export const AI_STEP_FLAGS = {
  classify: 'cf.ai.classify',
  draft: 'cf.ai.draft',
  rewrite: 'cf.ai.rewrite',
} as const;

/** Cờ theo workspace: pipeline TỰ chạy cho bình luận mới của workspace (thay `PIPELINE_ENABLED` + `PIPELINE_WORKSPACE_IDS`). Mặc định TẮT. */
export const PIPELINE_FLAG = 'cf.pipeline.v2';

export type AiStep = keyof typeof AI_STEP_FLAGS;

export const FLAG_DEFAULTS: Readonly<Record<string, boolean>> = {
  [AI_STEP_FLAGS.classify]: false,
  [AI_STEP_FLAGS.draft]: false,
  [AI_STEP_FLAGS.rewrite]: false,
  [PIPELINE_FLAG]: false,
};
