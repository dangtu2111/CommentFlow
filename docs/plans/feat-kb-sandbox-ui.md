# Kế hoạch `feat/kb-sandbox-ui` — dựng giao diện Thử AI (kb-sandbox)

## Việc

Mã gap matrix: UI KB (Phần 4a). Yêu cầu chủ dự án 11/11/2026: "làm hết các màn stitch đã có cho cơ sở tri thức".

**Tóm tắt (2–3 câu dễ hiểu):** Trang Thử AI (`/app/try-ai`) dựng lại theo `design/stitch/kb-sandbox.html`: cột trái nhập bình luận mẫu, cột phải kết quả (câu trả lời, quyết định tự gửi, nguồn). Chức năng chạy thử giữ nguyên. Các ô của thiết kế chưa có nền tảng (chọn nền tảng/bài viết, người hỏi, ngưỡng tin cậy, kịch bản mẫu, số liệu độ trễ) hoặc là nội dung mẫu bịa không đưa vào: ô chọn tắt kèm chú thích, không số mẫu.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Form giữ nhãn/nút cũ (E2E `ai-happy-path`, `ai-not-configured` xanh).
2. Kết quả chỉ hiển thị dữ liệu thật; không tràn ngang ở 1440/390.
3. typecheck, `lint:i18n`, biome xanh; `ui:fidelity kb-sandbox`: lệch 15/35 chỉ số (nền 16/35).

## File sẽ đọc / sửa

Sửa `components/try-ai/{try-ai-form,try-ai-result}.tsx`, `app/app/(guarded)/try-ai/page.tsx`, i18n `vi/en` (`tryAi.ui.*`). Ảnh sau ở `docs/plans/ui-fidelity/kb-sandbox/`.

## Migration

Không.

## Test viết trước

Không áp dụng (trình bày; hành vi giữ nguyên, đã có E2E).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web typecheck && pnpm lint:i18n`; E2E ở CI.

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Đủ thành phần chữ chỉ 17/147 vì phần lớn chữ của thiết kế là dữ liệu mẫu bịa (SKU, tên khách, số liệu), cố ý không dựng.
