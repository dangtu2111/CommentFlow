# Kế hoạch `feat-tw-automation-legal` — Dựng Tự động hóa, Quy tắc spam, Quyền riêng tư, Điều khoản, Landing bằng Tailwind

Mã gap matrix: `UI-TW-AUTOMATION-LEGAL` (tiếp nối `UI-HTML-AUTOMATION`, `UI-COMPLETE-AUTO-SPAM`) · Spec: docs/08 §7, ADR 013, `design/stitch/{automation,spam-rules,privacy-data-deletion,terms-dpa,landing-pricing}.html`.

**Tóm tắt:** Viết lại giao diện 5 màn bằng class Tailwind chép từ HTML Stitch (bọc `.tw`), thay CSS riêng cũ, theo quy tắc "đủ thành phần": mọi khối trong HTML đều có mặt; khối chưa có dữ liệu thật hiện `[MẪU]` (chỉ bản dev), khối chưa có chức năng hiện đúng thiết kế nhưng vô hiệu kèm "Sắp có". Không đổi logic nghiệp vụ, không migration. Rủi ro: lệch vài chữ cố ý đổi cho trung thực (Quyết định QTWAL1).

## Điểm chưa rõ

Không có. Quyết định tự chọn ghi ở `docs/plans/quyet-dinh/qtwal1.md`.

## Tiêu chí nghiệm thu

1. `/app/automation`, `/app/spam-rules` và 5 route mẫu `/dev/ui/{automation,spam-rules,landing,privacy,terms}` dựng bằng Tailwind trong khung `.tw`; không còn CSS riêng cho 5 màn (`styles/{automation,spam-rules,reports-legal}.css` rỗng) — kiểm: đọc diff + `pnpm --filter @flow/web typecheck`.
2. Mọi nhóm thành phần của 5 HTML có mặt — kiểm: `pnpm ui:fidelity <slug> //dev/ui/<tên> --base http://localhost:3103` (cần máy chủ xem trước nạp bản mới).
3. Hành vi thật giữ nguyên: lưu cấu hình tự động hóa (Owner), mặc định mọi ô Tắt, quy tắc spam, AI không tự ẩn — kiểm: test hiện có (`pnpm --filter @flow/web exec vitest run`) xanh.
4. Nút/ô chưa có chức năng có `aria-disabled` + "Sắp có"; số liệu mẫu chỉ ở dev — kiểm: đọc diff.
5. i18n vi/en đủ khóa cho trang thật, không chuỗi cứng — kiểm: `pnpm lint:i18n`, `i18n/messages.test.ts`.

## File sẽ đọc (≤ ~8, kèm lý do)

- `design/stitch/{automation,spam-rules,privacy-data-deletion,terms-dpa,landing-pricing}.html` — nguồn dựng duy nhất.
- `components/{automation,spam-rules,public}/*`, `app/dev/ui/{...}` — mã hiện có cần thay; `components/ui/tw-parts.tsx` — dùng lại.

## File sẽ sửa / tạo

- Viết lại `components/{automation,spam-rules}/*`, `components/public/*`, 5 route dev, 2 `page.tsx` thật; làm rỗng 3 CSS cũ (giữ file vì `app/layout.tsx` là tệp chung).
- Thêm khóa vào `packages/shared/src/i18n/messages/{vi,en}.json` (chỉ thêm).
- Tài liệu: quyết định, codemap, KT, gap matrix, MASTER, handoff.

## Migration

Không có.

## Test viết trước

Không có logic quy tắc mới (chỉ trình bày).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run`, `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise`, `pnpm check:plans`, `pnpm test:trace`.

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện; đường lưu cấu hình/quy tắc giữ nguyên, không chạm auth/RLS/thanh toán).

## Rủi ro / câu hỏi cho chủ dự án

Máy chủ xem trước có thể giữ bản cũ → bảng `ui:fidelity` cần khởi động lại máy chủ xem trước.

## Đề xuất thay đổi

Gỡ import 3 CSS rỗng ở `app/layout.tsx` bằng PR `[CHUNG]` riêng.

## Complexity tracking

Không có (không thêm thư viện; dùng lại `tw-parts`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR 013 và quy tắc UI-first).
