# Kế hoạch `feat-ui-html-auth` — Dựng lại Đăng nhập/Đăng ký và các trang xác thực từ HTML Stitch

## Việc

Mã gap matrix: `UI-AUTH-FIDELITY` · quy trình UI HTML-first (chủ dự án chốt 06/11/2026).

**Tóm tắt:** Dựng lại khung và các trang xác thực (đăng nhập, đăng ký, quên/đặt lại mật khẩu, kiểm tra email, xác minh email, 2FA đăng nhập, chấp nhận lời mời) theo `design/stitch/auth-login-register.html` (và `accept-invite.html`), bằng kit `components/ui`. CSS xác thực đang nằm lẫn trong `globals.css` → tách ra file riêng theo thành phần; khối "biểu tượng + tiêu đề + mô tả" lặp ở 3 trang → gom thành một thành phần `AuthStatus`. Rủi ro: lệch nhẹ pixel ở panel trái; thiết kế có huy hiệu/số liệu không có thật nên bỏ (Q-UIAUTH1).

## Điểm chưa rõ

Không có (mọi chỗ mơ hồ đã tự chọn phương án an toàn, ghi `docs/plans/quyet-dinh/q-uiauth1.md`).

## Tiêu chí nghiệm thu

1. CSS xác thực (`.auth-*`, `.panel-*`, `.demo-*`, `.social*`, `.divider`, `.status-icon*`) nằm trong `components/auth/*.css`, không còn trong `globals.css` — kiểm bằng grep + `git diff --stat` (dòng `globals.css` giảm).
2. `AuthStatus` thay markup lặp ở `check-email`, `verify-email`, `invite/[token]` — kiểm bằng test `auth-status.test.tsx` + grep không còn `status-icon` trong `app/`.
3. Số đo khung trang: header 64px, thẻ đăng nhập radius 12px / padding 40px (≥960px), tiêu đề thẻ 22px/28px, ô nhập cao 44px, nút gửi cao 44px — kiểm bằng script Playwright so bounding box/computed style với file HTML Stitch (kết quả ở `docs/plans/ui-fidelity/ui-html-auth/so-sanh.md`).
4. Trang lời mời KHÔNG hiển thị email người mời/người nhận, token, tên người gửi (giữ bất biến bảo mật hiện có) — kiểm bằng test trang hiện có + grep.
5. `pnpm precheck`, lint, lint:i18n, typecheck, depcruise, test web xanh.

## File sẽ đọc

`design/stitch/auth-login-register.html`, `accept-invite.html`; `components/auth/*`; `app/(auth)/*/page.tsx`; `app/invite/[token]/page.tsx`; `components/ui/{tabs,banner,chip}`; `styles/globals.css` (khối auth).

## File sẽ sửa / tạo

Tạo: `components/auth/{auth-shell,auth-demo-card,auth-social}.css` (theo thành phần), `components/auth/auth-status.tsx` + `auth-status.test.tsx`, `e2e`/script đo (`scripts/ui-compare-auth.mjs`), `docs/plans/ui-fidelity/ui-html-auth/so-sanh.md`. Sửa: `globals.css` (xóa khối auth), `app/layout.tsx` (import CSS mới), 3 trang dùng `AuthStatus`, `invite/[token]/page.tsx`. Docs: `docs/codemap.d/`, `docs/plans/quyet-dinh/q-uiauth1.md`, gap-matrix, MASTER, handoff.

## Migration

Không có.

## Test viết trước

`auth-status.test.tsx` (biến thể ok/lỗi/thông tin, vai trò `status`, không lộ nội dung ngoài props).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components/auth`

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện; không đổi logic phiên/2FA/token; trang lời mời giữ nguyên dữ liệu hiển thị).

## Rủi ro / câu hỏi cho chủ dự án

Thiết kế Stitch của lời mời có tên/email người gửi, token, "Meta Tech Partner" — không có thật/không được phép lộ → bỏ (Q-UIAUTH1). Nút Google không làm (đã chốt trước).

## Đề xuất thay đổi

Không đổi `docs/01–16`.

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

**Đã duyệt** (tự duyệt: quyết định theo chỉ dẫn chủ dự án 06/11/2026; không có thẻ chưa rõ).
