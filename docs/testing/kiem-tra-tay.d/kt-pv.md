## KT-PV — Đa dạng diễn đạt (PIPE-VARIATION, FR-161)

Chưa có giao diện/pipeline nối (còn `VARIATION-WIRE`); mục này chỉ kiểm test. Không cần tiếng Việt/Anh.
1. Chạy `pnpm --filter @flow/ai exec vitest run src/variation src/draft`. — Mong đợi: tất cả test xanh.
2. (Khi đã có khóa LLM, tùy chọn) gọi `createLlmDrafter` với `DRAFT_LLM_ENABLED=true` cho cùng một câu hỏi vài lần. — Mong đợi: `variants` 3–5 câu khác chữ, cùng giá/link; không có câu đổi số tiền (câu đổi số bị loại).

---
