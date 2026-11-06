# Kế hoạch `feat-tw-messages-auth` — Dựng Tin nhắn và Đăng nhập/Đăng ký/Lời mời bằng Tailwind

Mã gap matrix: `UI-TW-MESSAGES-AUTH` (tiếp nối `UI-FIDELITY-MESSAGES`, `UI-AUTH-FIDELITY`) · Spec: docs/08 §7, ADR 013, `design/stitch/{messages,auth-login-register,accept-invite}.html`.

**Tóm tắt:** Viết lại giao diện Tin nhắn (4 cột) và các trang xác thực (đăng nhập, đăng ký, quên/đặt lại mật khẩu, 2FA, kiểm tra email, xác minh email, nhận lời mời) bằng class Tailwind chép từ HTML Stitch, theo quy tắc "đủ thành phần": mọi khối trong HTML đều có mặt; khối thiếu dữ liệu hiện `[MẪU]` (chỉ bản dev), khối chưa có chức năng hiện đúng thiết kế nhưng vô hiệu kèm "Sắp có". Không đổi logic xác thực (Server Action, 2FA, rate limit giữ nguyên), không migration. Rủi ro: lệch nhỏ vài chữ cố ý đổi cho trung thực (xem QTWMA1).

## Điểm chưa rõ

Không có. Quyết định tự chọn ghi ở `docs/plans/quyet-dinh/qtwma1.md`.

## Tiêu chí nghiệm thu

1. `/login`, `/register`, `/forgot-password`, `/reset-password`, `/login/2fa`, `/check-email`, `/verify-email`, `/invite/[token]` và route mẫu `/dev/ui/messages`, `/dev/ui/auth` dựng bằng Tailwind trong khung `.tw` — kiểm bằng: đọc diff + `pnpm --filter @flow/web typecheck`.
2. Hành vi xác thực giữ nguyên (cùng Server Action, tên ô `email/password/name/code/token/passwordConfirm`, nhãn ô, lỗi theo ô, gửi lại thư) — kiểm bằng: test hiện có xanh + `e2e/tests/gate0.spec.ts` không đổi selector.
3. Mọi nhóm thành phần của 3 HTML có mặt (đầu trang, cột 1–4 Tin nhắn, panel giới thiệu, thẻ xác thực, panel lời mời) — kiểm bằng: `pnpm ui:fidelity <slug> <route> --base <preview>` ở 1440 và 1920.
4. Nút/ô chưa có chức năng có `aria-disabled` + "Sắp có"; dữ liệu mẫu chỉ hiện khi route dev / `showSampleData()` — kiểm bằng: test `message-center.test.tsx`, `auth-status.test.tsx`.
5. i18n vi/en đủ khóa, không chuỗi cứng trong JSX — kiểm bằng: `pnpm lint:i18n`, `i18n/messages.test.ts`.

## File sẽ đọc (≤ ~8, kèm lý do)

- `design/stitch/{messages,auth-login-register,accept-invite}.html` — nguồn dựng duy nhất.
- `components/messages/message-center.tsx`, `app/dev/ui/messages/page.tsx`, `components/auth/*`, 8 `page.tsx` xác thực — mã hiện có cần thay.
- `components/ui/tw-parts.tsx`, `components/dev/dev-shell.tsx` — tái dùng Panel/Badge/SoonButton/khung dev (không sửa).

## File sẽ sửa / tạo

- Viết lại `components/messages/message-center.tsx` (+ phần phụ) và `app/dev/ui/messages/page.tsx`.
- Viết lại `components/auth/{auth-shell,auth-demo-card,auth-social,auth-status,forms,two-factor-form}.tsx`; tạo `components/auth/auth-fields.tsx` (ô nhập Tailwind), `components/auth/invite-panel.tsx`; sửa 8 `page.tsx` xác thực; tạo route `/dev/ui/auth`.
- Giữ CSS cũ ở dạng không dùng (`app/layout.tsx` là tệp chung; gỡ import ở PR `[CHUNG]`).
- Thêm khóa vào `packages/shared/src/i18n/messages/{vi,en}.json` (chỉ trong nhánh `messagesUi`, `auth`, `invite`).
- Tài liệu: quyết định, codemap, KT, gap matrix, MASTER, handoff.

## Migration

Không có.

## Test viết trước

Không có logic quy tắc mới (trình bày). Logic cửa sổ 24 giờ (`messageWindowState`) giữ nguyên + test sẵn có. Test render mới cho `MessageCenter`, `AuthStatus`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run`, `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise`, `pnpm check:plans`, `pnpm test:trace`.

## Cần kiểm chứng độc lập không?

Không: chỉ lớp trình bày; Server Action/phiên/2FA không đổi. (Diff chạm form đăng nhập nhưng không chạm logic auth — nếu reviewer muốn, chạy verifier-security một lần.)

## Rủi ro / câu hỏi cho chủ dự án

Máy chủ xem trước có thể giữ bản dịch cũ nên bảng `ui:fidelity` cần khởi động lại máy chủ (người điều phối).

## Đề xuất thay đổi

Gỡ import CSS cũ của auth/messages ở `app/layout.tsx` bằng PR `[CHUNG]` riêng.

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
