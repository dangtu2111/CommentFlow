## KT-PC — Độ tin cậy do code tính (PIPE-CONFIDENCE, FR-163/032)

Hàm thuần, chưa nối cổng tự gửi (AUTO-SEND-GATE) → chưa có bước bấm tay; không cần khóa LLM, không cần tiếng Việt/Anh.
1. Chạy `pnpm --filter @flow/ai exec vitest run src/confidence`. — Mong đợi: tất cả test xanh (có test property-based `fast-check`, seed cố định).
2. Mở `packages/ai/src/confidence/confidence.ts`, xem `DEFAULT_CONFIDENCE_WEIGHTS`. — Mong đợi: trọng số `default@1`; không có chỗ nào đọc trường `confidence`/`self_score` của JSON LLM.
3. Kiểm tay khi nối pipeline: bản nháp có JSON hỏng hoặc hành động lạ → độ tin cậy 0, bình luận vào "Cần người", không tự gửi.
