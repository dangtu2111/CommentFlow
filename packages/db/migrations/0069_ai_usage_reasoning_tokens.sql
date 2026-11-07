-- AI-USAGE-REASONING (EVAL-RUNNER, Q-LLM2): ghi riêng số token SUY LUẬN của mô hình (OpenAI `completion_tokens_details.reasoning_tokens`).
-- Token suy luận đã nằm trong `output_tokens` và trong `cost_usd`; cột này chỉ để KIỂM rằng cấu hình `reasoning_effort` thấp nhất
-- thật sự cho token suy luận ≈ 0 (và để báo chi phí tách theo bước). Mặc định 0 (nhà cung cấp không trả thì 0).
-- Quyền: `cf_app` có GRANT SELECT, INSERT ở mức BẢNG (0001) nên cột mới tự có quyền.
-- Hạn chế đã biết: hàm gộp `cf.compact_ai_usage` (>90 ngày → `ai_usage_daily`) chưa mang cột này sang bảng ngày; chi phí
-- (`cost_usd`) vẫn đúng, chỉ mất phần tách token suy luận sau 90 ngày. Việc đó để gap `AI-USAGE-DAILY-REASONING`.
-- Đường lùi: ALTER TABLE cf.ai_usage DROP COLUMN reasoning_tokens (CHECK tự mất).
ALTER TABLE "cf"."ai_usage" ADD COLUMN "reasoning_tokens" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "cf"."ai_usage" ADD CONSTRAINT "ai_usage_reasoning_tokens_check" CHECK ("cf"."ai_usage"."reasoning_tokens" >= 0);
