# Kế hoạch `feat/composer-ai-caption` — Nối các nút còn thiếu trong Biên tập bài viết

Mã gap matrix: `POST-PUBLISHING` (phần mở rộng) · Quyết định: `docs/plans/quyet-dinh/qpub2.md`.

**Tóm tắt:** Nối chức năng cho nút AI gợi ý caption, Tự động hashtag, chèn emoji và chèn liên kết trong Biên tập. AI chỉ gợi ý, Owner tự chọn dùng; cờ `cf.ai.caption` mặc định TẮT; model từ `CAPTION_LLM_MODEL`. Rủi ro: AI bịa giá/khuyến mãi — chặn bằng kiểm code (`checkGuardMoney`).

## Điểm chưa rõ

Không có. Chưa làm, kèm lý do: gắn sản phẩm (cần Owner chốt luật xác nhận liên kết `post_products`), ghi chú riêng AI (cần tích hợp pipeline + EVAL), tải ảnh/video (lưu trữ + quyền Meta), gắn thẻ @ (Graph API không hỗ trợ), nội dung riêng từng kênh (chưa có giá trị khi chỉ Facebook).

## Tiêu chí nghiệm thu

1. Caption/hashtag gọi đúng MỘT lần LLM, che PII, ghi `ai_usage` — test `@flow/ai`.
2. Số/giá/liên kết AI tự thêm → từ chối — test.
3. Thiếu dịch vụ/model/cờ tắt → nút khóa kèm lý do, không gọi LLM — test.
4. Emoji/liên kết chèn đúng vị trí con trỏ; chỉ nhận https — test.
5. Server Action chỉ Owner, giới hạn `uiHeavy`, workspace từ phiên — kiểm tại chỗ.

## File sẽ đọc / sửa

Đọc: `try-ai-runtime.ts`, `llm-deps`, `composer/*`. Sửa/tạo: xem `docs/codemap.d/mien-composer-ai-caption.md`; i18n vi/en; `env.example`.
