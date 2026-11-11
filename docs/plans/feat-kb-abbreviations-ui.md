# Kế hoạch `feat/kb-abbreviations-ui` — trang Từ điển viết tắt (kb-abbreviations)

## Việc

Mã gap matrix: UI KB (Phần 4a). Yêu cầu chủ dự án 11/11/2026: "làm hết các màn stitch đã có cho cơ sở tri thức".

**Tóm tắt (2–3 câu dễ hiểu):** Mục "Từ điển viết tắt" ở rail Cơ sở kiến thức trước đây chỉ là chỗ "Sắp có" dù bảng dữ liệu và truy vấn đã có (migration 0041). Nay có trang `/app/kb/abbreviations` dựng theo `design/stitch/kb-abbreviations.html`: Owner thêm/sửa/xóa từ riêng của shop, xem từ điển hệ thống (chỉ đọc), tìm kiếm. Không migration; ghi qua `withActor` (RLS sẵn có). Số lượt nhận diện, nhập Excel, nhóm theo chủ đề không có nền tảng nên không dựng (nút Nhập Excel tắt, không số mẫu).

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Owner thêm/sửa/xóa được từ; trùng từ hoặc sai định dạng báo "không hợp lệ"; Staff nhận 404.
2. Rail hiện "Từ điển viết tắt" là liên kết thật; không tràn ngang ở 1440/390.
3. typecheck, `lint:i18n`, biome, test web xanh; `ui:fidelity kb-abbreviations` lệch 22/45 (khung ngoài chung).

## File sẽ đọc / sửa

Thêm `kb/abbreviation-actions.ts`, `kb/abbreviations/page.tsx`. Sửa `lib/app-nav.ts`, `lib/kb-structure.ts`, `components/kb/kb-frame.tsx`, `components/app/shell-nav.tsx`, i18n `vi/en`. Ảnh ở `docs/plans/ui-fidelity/kb-abbreviations/`.

## Migration

Không.

## Test viết trước

`kb/abbreviation-actions.test.ts` (11 ca): Staff bị chặn không ghi gì, Owner thêm/sửa/xóa, workspace lấy từ phiên không từ form, dữ liệu sai/trùng từ/giới hạn tốc độ, mục workspace khác (RLS giấu) → not_found. RLS thật đã có ở `packages/db/tests/abbreviations.int.test.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web typecheck && pnpm lint:i18n && pnpm --filter @flow/web test`.

## Cần kiểm chứng độc lập không?

Không (không đụng auth/RLS/migration; chỉ dùng hàm ghi có sẵn qua `withActor`, Owner-only).

## Rủi ro / câu hỏi cho chủ dự án

Trang mới ghi dữ liệu thật (từ điển của shop) nhưng ảnh hưởng trực tiếp tới bước chuẩn hóa câu khách; đảo ngược bằng cách xóa từ.
