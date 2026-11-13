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

/** Cờ theo workspace: câu trả lời đi đường fact plan (số/chính sách do code điền, ADR 017). Mặc định TẮT; bật bằng `pnpm flags:set`. */
export const FACT_SLOTS_FLAG = 'cf.ai.fact_slots';

/** Cờ theo workspace: chắt lọc kiến thức thô thành FAQ/thuộc tính NHÁP sau mỗi lần đồng bộ (M3, KB-DISTILL; tốn tiền LLM, có trần chi phí). Mặc định TẮT. */
export const DISTILL_FLAG = 'cf.ai.distill';

/** Cờ theo workspace: guard kiểm theo THẺ/chủ đề (ADR 018 T2/T4: nguồn = đoạn tìm được cùng chủ đề; nháp rỗng có nguồn → gọi lại 1 lần kèm mã lỗi). Mặc định TẮT. */
export const GUARD_FACTS_FLAG = 'cf.ai.guard_facts';

/** Cờ theo workspace: nút "AI gợi ý caption / hashtag" ở Biên tập bài viết (POST-PUBLISHING; tốn tiền LLM, có ghi `ai_usage`). Mặc định TẮT. */
export const CAPTION_FLAG = 'cf.ai.caption';

export type AiStep = keyof typeof AI_STEP_FLAGS;

export const FLAG_DEFAULTS: Readonly<Record<string, boolean>> = {
  [AI_STEP_FLAGS.classify]: false,
  [AI_STEP_FLAGS.draft]: false,
  [AI_STEP_FLAGS.rewrite]: false,
  [PIPELINE_FLAG]: false,
  [FACT_SLOTS_FLAG]: false,
  [DISTILL_FLAG]: false,
  [GUARD_FACTS_FLAG]: false,
  [CAPTION_FLAG]: false,
};
