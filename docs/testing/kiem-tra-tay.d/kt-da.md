## KT-DA — Thang xử lý khi AI không chắc (PIPE-DECIDE-ACTION, FR-147/141)

Hàm thuần, chưa nối pipeline → chưa có bước bấm tay; không cần khóa LLM, không cần tiếng Việt/Anh.
1. Chạy `pnpm --filter @flow/ai exec vitest run src/decide src/draft`. — Mong đợi: tất cả test xanh (có test property-based `fast-check`, seed cố định).
2. Mở `packages/ai/src/decide/decide-action.ts`, xem hàm `riskReason` và `decideAction`. — Mong đợi: rủi ro (ngôn ngữ khác, khiếu nại, mạo danh, lệch giá, pháp lý, hỏi lại ≥ 3) được xét TRƯỚC mọi thứ; không có chỗ nào đọc trường `action`/`needs_human` do AI tự ghi.
3. Mở `packages/ai/src/draft/draft-prompt.ts`, xem `SYSTEM_PROMPT`. — Mong đợi: có câu "chỉ viết câu cho đúng hành động đó" và "Không tự tính tổng tiền, giảm giá, phí ship".
4. Kiểm tay khi nối pipeline: bình luận "giá bao nhiêu, ship về Hà Nội bao nhiêu" với kiến thức chỉ có giá → câu gợi ý nêu giá + mời ib về phí ship, bình luận có tag Cần hỗ trợ thêm, không tự gửi khi `allow_partial` tắt.
