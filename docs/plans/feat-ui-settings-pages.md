# Kế hoạch `feat-ui-settings-pages` — Trang con Cài đặt khớp Stitch

## Việc

Mã gap matrix: `UI-FIDELITY-SETTINGS-PAGES` (tách từ `UI-FIDELITY-SETTINGS-DATA`) · Spec: docs/08 §7, FR-090/091/094, US-060/061/071.

**Tóm tắt:** Dựng 3 trang con trong khung Cài đặt hai cột: Gói & Thanh toán (theo `settings-billing.png`), Dữ liệu & Quyền riêng tư và Thông báo. Chỉ giao diện: nút thanh toán/xuất/xóa đều chưa hoạt động và ghi rõ "Sắp có"; không đổi logic nghiệp vụ, không migration. Rủi ro thấp: trang mới chỉ đọc hóa đơn và đồng hồ lượt AI đã có.

## Điểm chưa rõ

Không có. Mọi chỗ mơ hồ đã tự chọn phương án an toàn, ghi ở `docs/plans/quyet-dinh/qusp1.md` (Q-USP1).

## Tiêu chí nghiệm thu

1. Danh mục gói hiển thị đúng docs/10 §3 — kiểm bằng `plan-catalog.test.ts`.
2. Dòng hóa đơn dựng đúng tông/ngày/mô tả, dữ liệu hỏng không làm vỡ trang — `billing-view.test.ts`.
3. Xác nhận xóa workspace chỉ đúng khi gõ đúng tên — `data-privacy.test.ts`; Server Action không xóa/xuất gì.
4. Cột trái có 3 mục mới đúng vai trò (Gói/Quyền riêng tư chỉ Owner) — `settings-nav.test.ts`; nhãn vi/en đủ.
5. Giao diện 1440/390px khớp thiết kế ở phần có dữ liệu thật — ảnh ở `docs/plans/ui-fidelity/settings-pages/`.
6. `pnpm precheck` xanh.

## File sẽ đọc

`settings-nav.ts`, `settings-frame.tsx`, `usage-meter-card.tsx`, `packages/db/src/invoices.ts` (kiểu `InvoiceRow`, `listInvoices`), `settings/page.tsx`, hai ảnh Stitch.

## File sẽ sửa / tạo

Sửa: `settings-nav.ts` (+test), `settings-frame.tsx`, `layout.tsx` (nạp CSS), `vi.json`/`en.json`. Tạo: 3 trang + `privacy/actions.ts`, 3 `*-view.tsx`, `lib/{plan-catalog,billing-view,data-privacy}.ts` (+test), `styles/settings-pages.css`, 3 trang `/dev/ui/settings-*`, script chụp, tài liệu (quyết định, codemap, KT).

## Migration

Không có.

## Test viết trước

`plan-catalog`, `billing-view`, `data-privacy`, `settings-nav` (đỏ trước rồi mới viết mã).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib`

## Cần kiểm chứng độc lập không?

Không: không chạm auth/RLS/thanh toán thật; Server Action chỉ chuyển hướng, dùng `requireAppUser({role:'owner'})`.

## Rủi ro / câu hỏi cho chủ dự án

Gói hiện tại chưa hiển thị trên trang thật (chờ `PLANS-SCHEMA`, làn b). Cần thiết kế riêng cho Quyền riêng tư/Thông báo (`ui-thieu-thiet-ke.md`).

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-USP1).
