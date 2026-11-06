# Kế hoạch `feat-wire-settings-security` — Nối chức năng thật cho Cài đặt › Tài khoản & Bảo mật (làn a)

Mã gap matrix: `SETTINGS-SECURITY-WIRE` (gồm `AUTH-PWNED` phần đổi mật khẩu, `SETTINGS-SECURITY-DATA` phần nhật ký) · Spec: `docs/13_Security_Compliance.md` §2, `docs/08_UI_UX_Specification.md` §7, `design/stitch/settings-security.html`, `settings-password-changed.html`, `email-password-changed.html`.

**Tóm tắt:** Giao diện Cài đặt › Tài khoản & Bảo mật đã có, và phần lớn chức năng (đổi mật khẩu có kiểm mật khẩu hiện tại + chính sách + pwned + hủy phiên, bật/tắt 2FA, mã dự phòng, danh sách phiên thật + thu hồi, đổi ngôn ngữ) đã nối từ các PR trước. Nhánh này lấp các chỗ còn thiếu: email thông báo khi đổi mật khẩu, màn "đổi mật khẩu thành công", nhật ký kiểm toán cho mọi thay đổi bảo mật, và test E2E vi/en. Rủi ro: ghi nhật ký chạm đường auth (cần verifier-security một lần).

## Điểm chưa rõ

Không có. Các điểm tự chọn phương án an toàn ghi ở `docs/plans/quyet-dinh/qwss1.md`.

## Tiêu chí nghiệm thu

1. Đổi mật khẩu xong gửi email "mật khẩu vừa đổi" (vi/en, có liên kết đặt lại, không chứa mật khẩu); gửi lỗi không làm hỏng việc đổi — kiểm bằng: `change-password.test.ts`, `notify.test.ts`, E2E (Mailpit).
2. Đổi mật khẩu thành công chuyển tới màn thành công `/password-changed` (đủ thành phần của `settings-password-changed`), mọi phiên bị xóa — kiểm bằng: E2E `settings-security.spec.ts`.
3. Mọi thay đổi bảo mật (đổi mật khẩu, bật/tắt 2FA, tạo lại mã dự phòng, thu hồi một phiên, đăng xuất thiết bị khác) ghi `action_logs` `security.*` của chính người dùng, chỉ danh sách trắng số liệu, không mật khẩu/mã/email — kiểm bằng: `security-audit.test.ts`, `security-audit.int.test.ts` (RLS: không ghi vào workspace lạ, không giả actor).
4. Phiên thật: thiết bị thứ hai hiện trong danh sách, "Thu hồi" đăng xuất thiết bị đó — kiểm bằng: E2E.
5. Nhãn hành động `security.*` hiện đúng tiếng Việt/Anh ở trang Nhật ký — kiểm bằng: `security-audit.test.ts` (`actionLabelKey`) + `lint:i18n`.
6. Owner/Admin không tắt được 2FA, tạo lại mã cần mật khẩu, mã chỉ hiện một lần — đã có ở `two-factor.ts`; giữ nguyên, test hiện có xanh.

## File sẽ đọc (≤ ~8, kèm lý do)

- `apps/web/src/app/app/security/actions.ts` — Server Action hiện có để gắn nhật ký.
- `apps/web/src/app/app/(guarded)/settings/page.tsx` — xem phần đã nối.
- `packages/saas-core/src/auth/change-password.ts` — thêm hook báo email.
- `packages/saas-core/src/notify/templates.ts` — thêm mẫu thư.
- `packages/saas-core/src/tenancy/action-log.ts` — `writeActionLog` để tái dùng.
- `apps/web/src/server/auth.ts` — nơi lắp notifier vào luồng.
- `e2e/support/flows.ts`, `e2e/tests/gate0.spec.ts` — mẫu E2E.

## File sẽ sửa / tạo

Sửa: `change-password.ts` (+test), `templates.ts`, `notify.test.ts`, `tenancy/index.ts` (export `writeActionLog`), `server/auth.ts`, `security/actions.ts`, `lib/action-log-format.ts` (thêm nhãn), `vi.json`/`en.json`, `e2e/support/flows.ts`.
Tạo: `lib/security-audit.ts` (+test), `server/security-audit.ts`, `app/(auth)/password-changed/page.tsx`, `packages/db/tests/security-audit.int.test.ts`, `e2e/tests/settings-security.spec.ts`, tài liệu (Q, KT, codemap.d).

## Migration

Không có (nhật ký dùng `core.action_logs` + RLS 0016 sẵn có).

## Test viết trước

`change-password.test.ts` (hook `onChanged`), `notify.test.ts` (mẫu `password-changed`), `security-audit.test.ts`, `security-audit.int.test.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/saas-core exec vitest run src/auth/change-password.test.ts src/notify/notify.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib/security-audit.test.ts` · `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/security-audit.int.test.ts` (máy có DB).

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (auth/phiên/2FA/PII trong nhật ký).

## Rủi ro / câu hỏi cho chủ dự án

Còn lại, chưa làm (ghi gap matrix): số mã dự phòng còn lại (n/8) cần giải mã cột mã hóa của Better Auth; thông tin IP/vị trí phiên (quyết định riêng về lưu IP); chế độ Tối (đang "Sắp ra mắt").

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
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR; phương án an toàn ghi ở Q-WSS1).
