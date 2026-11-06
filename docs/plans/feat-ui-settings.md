# Kế hoạch `feat-ui-settings` — UI-FIDELITY nhóm 4: Cài đặt, Thành viên, Nhật ký

## Việc

Mã gap matrix: `UI-FIDELITY-SETTINGS` (ảnh `ui-settings`) · Spec: docs/08 §7 · Thiết kế: `design/stitch/settings-security.png`, `settings-2fa-setup-modal.png`, `settings-2fa-disable-modal.png`, `settings-change-password-modal.png`, `settings-password-changed.png`, `settings-workspace-members.png`, `settings-billing.png`, `activity-log.png`.

**Tóm tắt (UI-first, 06/11/2026):** làm các trang Cài đặt (Tài khoản & Bảo mật), Thành viên và Nhật ký giống thiết kế Stitch hơn: tiêu đề có đường dẫn, thẻ 2FA có biểu tượng + chip trạng thái + nút hành động, đổi mật khẩu và bật/tắt 2FA mở trong hộp thoại (có thanh bước, thanh độ mạnh mật khẩu), danh sách phiên/thành viên/nhật ký dạng dòng thẻ có ảnh đại diện chữ và chip màu. Không đổi logic nghiệp vụ (cùng Server Action, cùng kiểm tra), không migration. Số liệu/huy hiệu không có thật (điểm bảo mật 100/100, "Meta Tech Partner Tier 1", số điện thoại, ID tài khoản, KPI nhật ký 1.428/99,6%, QR VietQR…) không dựng — Q-UIST1.

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-UIST1.

## Tiêu chí nghiệm thu

1. Cài đặt: tiêu đề + đường dẫn, thẻ 2FA (biểu tượng, chip trạng thái, nút Tắt 2FA / Tạo lại mã dự phòng mở hộp thoại), thẻ thông tin tài khoản (tên, email, vai trò thật), hàng Đổi mật khẩu, thẻ phiên, thẻ hiển thị & ngôn ngữ — kiểm bằng ảnh 1440px `/dev/ui/settings`.
2. Hộp thoại bật 2FA có thanh 3 bước đúng trạng thái (`enrollStep` test), hộp thoại đổi mật khẩu có thanh độ mạnh + danh sách kiểm (`passwordChecks`/`passwordStrength` test), hộp thoại tắt 2FA — kiểm bằng ảnh + test; hộp thoại đóng được bằng Esc/nút đóng (a11y `<dialog>`).
3. Thành viên: dòng có ảnh đại diện chữ, chip vai trò (`roleTone`) + trạng thái, nút thao tác giữ nguyên — ảnh `/dev/ui/members`.
4. Nhật ký: dòng có chip hành động theo tông (`activityTone` test), chi tiết dạng thẻ, đầu trang có nhãn "Chỉ đọc" — ảnh `/dev/ui/activity`.
5. Mobile 390px không tràn ngang — ảnh.
6. Không bịa số liệu: dữ liệu mẫu chỉ ở `/dev/ui/*` (404 khi production), gắn nhãn [MẪU] — đọc code. Trang "Gói & Thanh toán" (`settings-billing.png`) chưa dựng (chưa có `PLANS-SCHEMA`/thanh toán) → gap matrix.
7. Công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`design/stitch/settings-*.png`, `activity-log.png`; `settings/page.tsx`; `components/security/*`; `members/page.tsx`; `components/activity/*`; `activity/page.tsx`; `styles/globals.css` (khối card/session/member/log); `app/dev/ui/comments/page.tsx` (mẫu trang dev).

## File sẽ sửa / tạo

- `apps/web/src/lib/settings-visual.ts` (+test) — hàm thuần: `passwordChecks`, `passwordStrength`, `enrollStep`, `activityTone`, `roleTone`.
- `components/ui/dialog.tsx` (hộp thoại `<dialog>` dùng chung, client), `components/security/{two-factor-card,change-password-card,sessions-card}.tsx`, `components/settings/{language-card,usage-meter-card}.tsx`, `settings/page.tsx`.
- `components/app/members-view.tsx` (phần trình bày danh sách, tách khỏi `members/page.tsx` để trang mẫu dùng lại), `members/page.tsx`.
- `components/activity/*`, `activity/page.tsx`; `styles/globals.css`.
- `app/dev/ui/{settings,members,activity}/page.tsx` + `components/dev/dev-shell.tsx` — trang xem mẫu ([MẪU]).
- `packages/shared/src/i18n/messages/{vi,en}.json` — chuỗi mới.
- `docs/plans/ui-fidelity/ui-settings/*`, `docs/plans/quyet-dinh/q-uist1.md`, gap-matrix, MASTER, `docs/codemap.d/`, handoff, `docs/testing/KIEM_TRA_TAY.md`.

## Migration

Không có.

## Test viết trước

`settings-visual.test.ts` (hàm thuần).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/settings-visual.test.ts`

## Cần kiểm chứng độc lập không?

Không: chỉ trình bày; Server Action, kiểm tra mật khẩu/2FA, phiên giữ nguyên (diff sẽ được rà để bảo đảm không đổi tên trường form `password`, `currentPassword`, `newPassword`, `confirmPassword`, `code`, `sessionId`).

## Rủi ro / câu hỏi cho chủ dự án

Gói & Thanh toán, điểm bảo mật, thiết bị đồng bộ, KPI nhật ký, xuất audit/lưu trữ cần dữ liệu/chức năng chưa có → gap `UI-FIDELITY-SETTINGS-DATA`.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Tiêu chí nghiệm thu kiểm được
- [x] Không còn thẻ cần làm rõ
- [x] Không migration, không thư viện mới
- [x] Test viết trước cho hàm thuần

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định đã có trong chỉ đạo UI-first 06/11/2026 + Q-UIST1)
