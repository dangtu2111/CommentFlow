# Kế hoạch `feat-tw-leads-reports` — Dựng Khách tiềm năng, Nhật ký hoạt động, Báo cáo bằng Tailwind

Mã gap matrix: `UI-TW-LEADS-REPORTS` (tiếp nối `UI-HTML-LEADS-REPORTS`) · Spec: docs/08 §7, ADR 013, `design/stitch/{leads,activity-log,reports}.html`.

**Tóm tắt:** Viết lại giao diện ba màn (Khách tiềm năng, Nhật ký, Báo cáo) bằng class Tailwind chép từ HTML Stitch, thay cho CSS riêng cũ, theo quy tắc "đủ thành phần": mọi khối trong HTML đều có mặt; khối chưa có dữ liệu thật hiện dữ liệu mẫu `[MẪU]` (chỉ bản dev), khối chưa có chức năng hiện đúng thiết kế nhưng vô hiệu kèm "Sắp có". Không đổi logic nghiệp vụ, không migration. Rủi ro: lệch nhỏ so với HTML ở vài chữ cố ý đổi cho trung thực (xem Quyết định).

## Điểm chưa rõ

Không có. Quyết định tự chọn ghi ở `docs/plans/quyet-dinh/qtwlr1.md`.

## Tiêu chí nghiệm thu

1. Ba trang thật (`/app/leads`, `/app/reports`, `/app/activity`) và ba route mẫu `/dev/ui/{leads,reports,activity}` dựng bằng Tailwind trong khung `.tw`; không còn CSS riêng cho ba trang (`styles/{leads,reports,activity}.css` rỗng) — kiểm bằng: đọc diff + `pnpm --filter @flow/web typecheck`.
2. Mọi nhóm thành phần của 3 HTML có mặt (đầu trang, thẻ số liệu, thanh lọc, Kanban + ngăn chi tiết, biểu đồ, bảng, hộp đề xuất, ngăn kiểm tra) — kiểm bằng: `pnpm ui:fidelity <slug> //dev/ui/<tên> --base <preview>` (cần máy chủ xem trước nạp lại bản dịch mới).
3. Dữ liệu thật giữ nguyên hành vi: SĐT chỉ 4 số cuối; Staff chỉ số cá nhân; bộ lọc Nhật ký là GET form; chi tiết trước/sau đọc từ `action_logs` — kiểm bằng: test hiện có (`pnpm --filter @flow/web exec vitest run`) vẫn xanh.
4. Nút/ô chưa có chức năng có `aria-disabled` + chú thích "Sắp có"; số liệu mẫu không hiện ngoài `APP_ENV=dev` (hiện "—") — kiểm bằng: đọc `showSampleData()` được truyền xuống mọi khối mẫu; `reports-sample.test.ts`.
5. i18n vi/en đủ khóa, không chuỗi cứng trong JSX — kiểm bằng: `pnpm lint:i18n`, `i18n/messages.test.ts`.

## File sẽ đọc (≤ ~8, kèm lý do)

- `design/stitch/{leads,reports,activity-log}.html` — nguồn dựng duy nhất.
- `apps/web/src/components/{leads,reports,activity}/*`, 3 `page.tsx` + 3 route `/dev/ui/*` — mã hiện có cần thay.
- `docs/decisions/013-tailwind.md`, `apps/web/eslint.config.mjs` — luật `.tw` và lint i18n (tên prop).

## File sẽ sửa / tạo

- Tạo `components/ui/tw-parts.tsx` (Panel, Badge, SoonButton, Meter, TwPage — file MỚI, không sửa kit cũ).
- Viết lại `components/{leads,reports,activity}/*`; tạo thêm `lead-drawer`, `kpi-tile`, `trend-card`, `intent-card`, `insight-card`, `activity-view`.
- Tạo `lib/{lead-card,leads-sample,reports-sample,activity-sample}.ts` (+ test `reports-sample.test.ts`).
- Sửa 3 `page.tsx` thật và 3 route dev; làm rỗng 3 file CSS cũ (giữ file vì `app/layout.tsx` — tệp chung — còn import).
- Thêm khóa vào `packages/shared/src/i18n/messages/{vi,en}.json` (chỉ thêm).
- Tài liệu: quyết định, codemap, KT, gap matrix, MASTER, handoff.

## Migration

Không có.

## Test viết trước

Không có logic quy tắc mới (chỉ trình bày). Hàm thuần mới `donutArcs` có test.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run`, `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise`, `pnpm check:plans`, `pnpm test:trace`.

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện, đường dữ liệu đọc giữ nguyên; không chạm auth/RLS/thanh toán).

## Rủi ro / câu hỏi cho chủ dự án

Máy chủ xem trước đang giữ bản dịch cũ nên bảng `ui:fidelity` chưa đo được đúng; cần khởi động lại máy chủ xem trước (người điều phối).

## Đề xuất thay đổi

Gỡ ba dòng `import '../styles/{leads,reports,activity}.css'` ở `app/layout.tsx` bằng PR `[CHUNG]` riêng.

## Complexity tracking

Không có (không thêm thư viện; `tw-parts` có ≥ 2 nơi dùng ngay).

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
