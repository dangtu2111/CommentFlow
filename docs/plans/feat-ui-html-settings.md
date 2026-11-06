# Kế hoạch `feat-ui-html-settings` — Dựng lại trang Cài đặt TỪ HTML Stitch

## Việc

Mã gap matrix: `UI-HTML-SETTINGS` · Spec: docs/08 §7 · Nguồn dựng duy nhất: `design/stitch/settings-security.html` (+ `settings-2fa-*`, `settings-change-password-modal`, `settings-password-changed`, `settings-workspace-members`, `settings-billing`).

**Tóm tắt (UI-first, HTML-first):** đưa khung Cài đặt về đúng bố cục HTML Stitch: đầu trang (đường dẫn + tiêu đề) chiếm cả hàng trên, cột con 3/12 và nội dung 9/12 độc lập (không còn khoảng trống do hai cột chung hàng lưới), lề trang 24px; thẻ có tiêu đề 18px, mô tả 12px, biểu tượng trần 24px (chỉ thẻ chính — 2FA — dùng ô 48px nền nút chính). Chỉ sửa kit (`SectionHead`, `Stat`, `SplitLayout`, `PageHeader`) + CSS; không đổi logic, không migration. Huy hiệu/số liệu minh họa của Stitch không có thật (Meta Partner Tier 1, ISO 27001, điểm bảo mật 100/100, iPhone 15 Pro, ID, số điện thoại, IP/vị trí) không dựng — Q-UIHS1.

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-UIHS1.

## Tiêu chí nghiệm thu

1. Lưới: cột con ≈ 3/12, nội dung ≈ 9/12, lề trang 24px, thẻ đầu của cột nội dung thẳng mép trên với thẻ cột con — kiểm bằng `e2e/support/measure-settings.mjs` (bbox).
2. `SectionHead` mặc định biểu tượng trần 24px; `hero` dùng ô 48px — kiểm bằng test kit.
3. `PageHeader` là một phần tử `<header>` (mô tả không rơi sang cột phải) — test kit; trang Kênh dùng `PageHeader`.
4. Mobile 390px không tràn ngang — ảnh `settings-security-sau-390.png`.
5. Công tắc đường logic không đổi: test e2e/flows 2FA vẫn tìm được "Đang bật" (chip nằm trong tiêu đề).
6. Công cụ xanh: precheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`design/stitch/settings-security.html`; `components/ui/{split-layout,section-head,stat,page-header}.*`; `components/settings/settings-frame.tsx`; `components/security/two-factor-card.tsx`; `styles/globals.css` (khối Cài đặt); `app/dev/ui/{settings,members,settings-billing}/page.tsx`.

## File sẽ sửa / tạo

Kit `ui/{split-layout.css,section-head.{tsx,css},stat.css,page-header.tsx,kit.test.tsx}`; `styles/globals.css`; `two-factor-card.tsx`; `channels/page.tsx`; `dev/ui/settings-billing/page.tsx`; `e2e/support/measure-settings.mjs`; docs (gap-matrix, MASTER, codemap.d, quyết định, KT, handoff, ảnh `ui-fidelity/ui-html-settings`).

## Migration

Không có.

## Test viết trước

Test render kit `SectionHead` (hero/trần) và `PageHeader`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components/ui`; `pnpm lint:i18n`; `pnpm typecheck`.

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện; không chạm auth/token/2FA logic — chỉ chuyển chip trạng thái vào tiêu đề).

## Rủi ro / câu hỏi cho chủ dự án

`SectionHead` đổi kiểu biểu tượng cho mọi thẻ Cài đặt (Thành viên, Gói, Thông báo, Quyền riêng tư) — kiểm bằng ảnh. Hộp thoại 2FA/đổi mật khẩu và trang "đã đổi mật khẩu" chưa tinh chỉnh pixel trong lượt này (ghi gap `UI-HTML-SETTINGS-MODALS`).

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
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định nằm trong spec/ADR hoặc Q-UIHS1).
