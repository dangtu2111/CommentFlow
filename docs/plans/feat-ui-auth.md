# Kế hoạch `feat-ui-auth` — UI-FIDELITY nhóm 1: giao diện xác thực khớp thiết kế Stitch

Mã gap matrix: `UI-AUTH` (làm lại cho khớp thiết kế) · Spec: `docs/08_UI_UX_Specification.md` §2, §6, §8; thiết kế `design/stitch/auth-login-register.png`, `accept-invite.png`.

**Tóm tắt:** Quy định UI-first (06/11/2026): hoàn thiện giao diện trước khi gắn chức năng. Việc này chỉ sửa **giao diện** các trang đăng nhập/đăng ký/quên-đặt lại mật khẩu/xác minh/2FA/kiểm tra email/chấp nhận lời mời cho gần thiết kế Stitch hơn: khung có nền gradient, panel giới thiệu có thẻ minh họa gắn nhãn `[MẪU]`, nút Facebook (tắt khi chưa cấu hình), đường kẻ "hoặc bằng email", nút chính có mũi tên. Rủi ro: thiết kế chứa huy hiệu/số liệu không có thật nên phải bỏ hoặc thay bằng nội dung trung thực (Q-UIA1). Không đổi logic nghiệp vụ, không migration.

Ngoài phạm vi (không đổi logic): "Ghi nhớ đăng nhập 30 ngày" (phiên cố định 14 ngày), đăng nhập Google, bước chấm điểm độ mạnh mật khẩu và checklist 2FA lúc nhận lời mời (cần logic mới), thông tin người mời/kênh trong trang nhận lời mời (spec 13 cấm lộ ngoài tên workspace + vai trò). Ba thư (`email-invite`, `email-password-changed`, `staff-welcome`): xem mục Điểm chưa rõ.

## Điểm chưa rõ

Không có. (Các điểm mơ hồ đã tự chọn phương án an toàn, ghi `Q-UIA1` trong `docs/plans/QUYET_DINH_CHO_DUYET.md`.)

## Tiêu chí nghiệm thu

1. Trang `/login` và `/register` ở 1440px có: nền gradient nhạt, panel trái (huy hiệu trung thực, tiêu đề, thẻ minh họa `[MẪU]`, ghi chú bảo mật đúng sự thật), thẻ phải có tab, nút Facebook tắt, đường kẻ "hoặc", nút chính có mũi tên — kiểm bằng: ảnh chụp trước/sau trong `docs/plans/ui-fidelity/ui-auth/`.
2. Không còn nội dung bịa (Meta Tech Partner Certified, 500+, 98.6%, 18 giờ, logo đối tác) — kiểm bằng: `pnpm lint:i18n` + đọc `vi.json`/`en.json`.
3. Nút Facebook hiển thị nhưng `disabled`, có chú thích; không có nút Google — kiểm bằng: test component.
4. i18n `vi`/`en` khớp khóa — kiểm bằng: `pnpm lint:i18n` và test khóa i18n hiện có.
5. Thẻ minh họa có nhãn `[MẪU]`/`[SAMPLE]` và `aria-hidden` không đọc như dữ liệu thật — kiểm bằng: test component.
6. Lỗi i18n nền tảng (khóa `activity.actions` chứa dấu chấm làm vỡ MỌI trang trong dev) được sửa và có test hồi quy — kiểm bằng: `action-log-format.test.ts`.
7. Mobile 390px không tràn ngang — kiểm bằng: ảnh chụp.

## File sẽ đọc

`auth-shell.tsx`, `forms.tsx`, `(auth)/login/page.tsx`, `invite/[token]/page.tsx`, `styles/globals.css`, `styles/tokens.css` (đã đọc); ảnh thiết kế.

## File sẽ sửa / tạo

- `apps/web/src/components/auth/auth-shell.tsx`, `forms.tsx` — khung, panel, nút Facebook, đường kẻ.
- `apps/web/src/components/auth/auth-demo-card.tsx` (mới) + test — thẻ minh họa `[MẪU]`.
- `apps/web/src/styles/globals.css` — kiểu mới dùng token.
- `packages/shared/src/i18n/messages/{vi,en}.json` — chuỗi mới; đổi khóa `activity.actions.*` dùng `_`.
- `apps/web/src/lib/action-log-format.ts` (+ test), 3 file `components/activity/*` — sửa lỗi khóa i18n.
- `e2e/support/shot-auth.mjs`, `e2e/support/dev-ui.mjs` — công cụ chụp/chạy web dev với biến GIẢ.
- `docs/plans/ui-fidelity/ui-auth/`, `QUYET_DINH_CHO_DUYET.md`, `docs/plans/ui-thieu-thiet-ke.md`, `gap-matrix`, `MASTER`, `codemap`, `handoff`, `KIEM_TRA_TAY.md`.

## Migration

Không có.

## Test viết trước

Logic thuần duy nhất: ánh xạ khóa nhãn hành động (`actionLabelKey`) — test đã đổi trước. Phần còn lại là giao diện (test component).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/action-log-format.test.ts src/components/auth` · `pnpm lint:i18n`

## Cần kiểm chứng độc lập không?

Không (không đổi auth/phiên/token; chỉ giao diện).

## Rủi ro / câu hỏi cho chủ dự án

Ba thư email và `staff-welcome` được dựng ở `packages/saas-core/src/notify` (mẫu thư); sửa HTML thư nằm ngoài làn giao diện web — xem gap matrix.

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

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong quy định UI-first 06/11/2026 và `Q-UIA1`).
