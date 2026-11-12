# Kế hoạch `feat/reply-address-ui` — REPLY-ADDRESS-UI: kiểm và chốt giao diện xưng hô

## Việc

Mã gap matrix: REPLY-ADDRESS-UI (Phần 4e, thứ tự chủ dự án 12/11/2026).

**Tóm tắt (2–3 câu dễ hiểu):** Mục này ghi "thiếu giao diện + lưu xưng hô", nhưng khi kiểm thì giao diện đã có ở trang Giọng văn (KB-CONTENT-UI) và lưu qua `brand_voice` từ migration 0036; guard kiểm lệch xưng hô cũng đã có. Việc còn thiếu là bằng chứng kiểm thử: nay thêm E2E lưu rồi đọc lại xưng hô và từ chối "tên riêng" khi để trống tên, rồi đóng mục trong gap matrix. Không đổi code sản phẩm.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. E2E: chọn tự xưng "mình" + gọi khách "Quý khách", lưu, đọc lại đúng.
2. E2E: tự xưng "tên riêng" để trống tên → báo không hợp lệ, giữ giá trị cũ.
3. Gap matrix ghi đúng vị trí giao diện/lưu/guard.

## File sẽ đọc / sửa

Đọc: `kb/voice/page.tsx`, `packages/shared/src/reply-style.ts`, `kb-content.ts`. Sửa: `e2e/tests/kb-content.spec.ts`, `docs/gap-matrix.md`.

## Migration

Không.

## Test viết trước

Mở rộng E2E "Giọng văn" (đã chạy qua cục bộ, vi/en).

## Lệnh test phạm vi hẹp

`pnpm e2e e2e/tests/kb-content.spec.ts`.

## Cần kiểm chứng độc lập không?

Không: chỉ thêm test và cập nhật tài liệu.

## Rủi ro / câu hỏi cho chủ dự án

Không. (Phần "guard kiểm lệch xưng hô" thuộc AI, đã đo ở EVAL: "Xưng hô sai cấu hình = 0".)
