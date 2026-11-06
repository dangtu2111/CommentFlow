# Kế hoạch `feat-tw-settings` — Dựng trang Cài đặt bằng Tailwind (làn a)

Mã gap matrix: `UI-TW-SETTINGS` · Spec: `docs/08_UI_UX_Specification.md` §7, ADR 013, `design/stitch/settings-*.html`.

**Tóm tắt:** Dựng lại khung Cài đặt, trang Tài khoản & Bảo mật, Thành viên, Gói & Thanh toán và các hộp thoại 2FA/đổi mật khẩu bằng class Tailwind chép từ HTML Stitch, thay phần CSS riêng (`settings-layout`, `card`, `dialog`…) của các trang này. Chỉ đổi phần trình bày: Server Action, tên trường form, truy cập dữ liệu giữ nguyên. Rủi ro: nhiều trang cùng dùng khung nên lệch một chỗ ảnh hưởng cả nhóm → đo lệch bằng `pnpm ui:fidelity`.

## Điểm chưa rõ

Không có. Các chỗ HTML Stitch bịa số liệu/huy hiệu (Meta Tech Partner Tier 1, ISO 27001, "Đạt chuẩn Meta Partner", điểm bảo mật 100) → thay bằng nội dung trung thực/ dữ liệu thật; ghi ở `docs/plans/quyet-dinh/q-tws1.md`.

## Tiêu chí nghiệm thu

1. Khung Cài đặt + Bảo mật dựng bằng class Tailwind trong `<div className="tw">`, không còn dùng `split-layout.css`/`settings-pages.css` ở các trang này — kiểm bằng: `grep` + ảnh chụp.
2. Server Action và tên trường form không đổi; test hiện có của `settings`/`security`/`members` vẫn xanh — kiểm bằng: `pnpm --filter @flow/web test` phạm vi.
3. `pnpm ui:fidelity settings-security /app/settings` đủ thành phần ≥ 95% (hoặc mục thiếu có lý do) và lệch hình học ≤ 2px ở mốc — kiểm bằng: bảng trong PR.
4. Mọi chữ mới có khóa i18n vi/en; `pnpm lint:i18n` xanh.
5. Thành phần chưa có chức năng hiện đúng thiết kế, vô hiệu kèm "Sắp có" (`aria-disabled`).
6. Trang `/dev/ui/*` cho dữ liệu `[MẪU]` của các màn đã port.

## File sẽ đọc

`design/stitch/settings-*.html`, `components/settings/*`, `components/security/*`, `components/app/members-view.tsx`, `components/ui/{split-layout,dialog,section-head}.tsx` (chỉ đọc, không sửa), `lib/settings-nav.ts`, `settings-visual.ts`.

## File sẽ sửa / tạo

- Tạo `components/settings/tw/` (thành phần Tailwind riêng của Cài đặt: thẻ, nút, chip, hộp thoại `<dialog>`).
- Sửa `components/settings/settings-frame.tsx`, `security/*`, `settings/account-card.tsx`, `language-card.tsx`, `app/members-view.tsx`, `settings/billing-view.tsx`.
- Sửa `packages/shared/src/i18n/messages/{vi,en}.json` (khóa mới trong khối `settings`).
- Không sửa `components/ui/*`, `tailwind.config.ts`, `styles/*` (file chung).

## Migration

Không có.

## Test viết trước

Hàm thuần mới (nếu có) trong `lib/settings-visual.ts` có test trước; phần trình bày kiểm bằng render test + ảnh.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components/settings src/components/security src/components/app`

## Cần kiểm chứng độc lập không?

Không (không đổi auth/RLS/token; chỉ trình bày). Hộp thoại 2FA/đổi mật khẩu giữ nguyên Server Action.

## Rủi ro / câu hỏi cho chủ dự án

Stitch gộp Kênh/Thành viên/Gói/Quyền riêng tư vào một màn Thành viên, trong khi repo đã có trang riêng → giữ trang riêng, thanh tab điều hướng giữa chúng (Q-TWS1).

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

**Trạng thái duyệt:** Đã duyệt (tự duyệt: mọi quyết định có trong ADR 013 + chỉ dẫn làn).
