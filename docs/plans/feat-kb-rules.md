# Kế hoạch `feat/kb-rules` — trang Quy tắc trả lời & Giới hạn (kb-rules), chỉ đọc

## Việc

Mã gap matrix: UI KB (Phần 4a), màn `design/stitch/kb-rules.html`; liên quan KB-SCOPE-CHANNEL. Chủ dự án (12/11) dự kiến migration chỉ-thêm; tôi chọn KHÔNG migration — lý do và cách đảo ngược ở `docs/plans/quyet-dinh/q-kb-rules-khong-migration.md`.

**Tóm tắt (2–3 câu dễ hiểu):** Thêm trang `/app/kb/rules` gom các giới hạn đang áp dụng cho AI ở một chỗ: điều AI không được làm/nói (từ Giọng văn), từ khóa chặn tự gửi và câu mời chuyển người (từ Cài đặt tự gửi/Giọng văn), cách xử lý khi thiếu dữ liệu. Mỗi quy tắc vẫn chỉnh ở trang chứa nó (có liên kết). Cách báo giá theo kênh và câu ứng xử riêng khi không biết cần đổi hành vi của AI nên là mục tắt "Sắp có".

## Điểm chưa chốt

Có muốn lưu cấu hình báo giá theo kênh (bảng mới + nối `decideAction`) không → PR riêng nếu có (xem Q-KB-RULES).

## Tiêu chí nghiệm thu

1. Owner xem được; Staff nhận 404; dữ liệu THẬT (điều cấm, từ khóa, câu mời chuyển người theo ngôn ngữ); workspace mới báo trống thật.
2. Không có ô chọn/nhập giả: phần chưa có nơi lưu là mục tắt; có liên kết thật tới `/app/automation`, `/app/kb/voice`, `/app/kb-gaps`, `/app/try-ai`.
3. Rail KB: "Quy tắc & Giới hạn" thành liên kết thật (không còn "Sắp có").
4. typecheck, `lint:i18n`, biome, test web xanh; E2E ca mới qua.

## File sẽ đọc / sửa

Thêm: `apps/web/src/app/app/(guarded)/kb/rules/page.tsx`. Sửa: `lib/app-nav.ts`, `lib/kb-structure.ts`, `components/kb/kb-frame.tsx`, `components/app/shell-nav.tsx`, i18n `vi/en`, `e2e/tests/kb-content.spec.ts`.

## Migration

Không.

## Test viết trước

E2E "Quy tắc & Giới hạn: trang chỉ đọc…"; cập nhật E2E tổng quan KB (Quy tắc không còn là mục Sắp có).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web test` · `pnpm e2e e2e/tests/kb-content.spec.ts`.

## Cần kiểm chứng độc lập không?

Không: chỉ đọc, không migration, không đụng cổng tự gửi/`sendRecheck`/auth/RLS/che PII.

## Rủi ro / câu hỏi cho chủ dự án

- Lệch kỳ vọng "migration chỉ-thêm": nếu muốn có cấu hình báo giá theo kênh ngay, cần PR riêng (có đổi hành vi AI, cần tự kiểm + EVAL).
- Chưa chụp ảnh `ui:fidelity kb-rules` (trang đơn giản hơn thiết kế vì thiếu khối lưu trữ).
