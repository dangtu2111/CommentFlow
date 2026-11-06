# Kế hoạch `feat-ui-settings-v2` — Làm lại trang Cài đặt khớp thiết kế Stitch

Mã gap matrix: `UI-FIDELITY-SETTINGS-V2` · Spec: docs/08 §7 (Cài đặt), `design/stitch/settings-security.png` (+ các `settings-*` modal).

**Tóm tắt:** Trang Cài đặt hiện là một cột thẻ rời, chưa có khung "cột trái điều hướng con + cột phải các thẻ" như thiết kế. Làm lại khung này (dùng chung cho Bảo mật, Kênh, Thành viên), bổ sung khối còn thiếu (mã dự phòng, thu hồi phiên, chọn giao diện Sáng/Tối) bằng dữ liệu thật; khối thiết kế không có dữ liệu thật thì bỏ. Rủi ro: thêm một thao tác "đăng xuất các thiết bị khác" trong `saas-core` (nhạy cảm → kiểm chứng độc lập một lần).

## Điểm chưa rõ

Không có. (Tự chọn phương án an toàn: Q-UISET2.)

## Tiêu chí nghiệm thu

1. Cột trái "CẤU HÌNH WORKSPACE" liệt kê đúng các mục có trang thật (Kênh, Thành viên chỉ Owner; Tài khoản & Bảo mật), không mục chết — kiểm bằng: `settings-nav.test.ts`.
2. Thanh tab Cài đặt cũ bị thay bằng khung mới; menu bên trái vẫn đánh dấu "Cài đặt" ở cả 3 trang — kiểm bằng: `app-nav.test.ts`.
3. "Đăng xuất tất cả thiết bị khác" xóa mọi phiên của chính người dùng trừ phiên hiện tại, không đụng người khác — kiểm bằng: test đơn vị `revokeOtherSessions` (saas-core).
4. Banner "Kích hoạt 2FA thành công" chỉ hiện ngay sau khi bật (trạng thái client, không hiện khi tải lại) — kiểm bằng: KT-UIS2 bước 4 (state client, không có logic quy tắc để test đơn vị).
5. Khối Sáng/Tối: Sáng chọn sẵn, Tối bị tắt kèm nhãn "Sắp ra mắt"; không số liệu/chứng nhận bịa — kiểm bằng: ảnh chụp 1440/390 ở `docs/plans/ui-fidelity/settings-v2/`.
6. `pnpm precheck`, lint:i18n, typecheck, depcruise, test phạm vi xanh.

## File sẽ đọc

`app-nav.ts`, settings `page.tsx`, `two-factor-card.tsx`, `sessions-card.tsx`, `two-factor.ts` (saas-core), channels/members `page.tsx`, `vi.json`/`en.json` (đã đọc).

## File sẽ sửa / tạo

- `apps/web/src/lib/settings-nav.ts` (+ test): danh sách mục điều hướng con theo vai trò.
- `components/settings/settings-frame.tsx`, `appearance-card.tsx`: khung 2 cột; thẻ Sáng/Tối.
- `components/security/{two-factor-card,sessions-card}.tsx`: khối mã dự phòng, banner vừa bật, nút Thu hồi/Đăng xuất thiết bị khác.
- `settings/page.tsx`, `channels/page.tsx`, `members/page.tsx`, `dev/ui/settings`: dùng khung mới.
- `lib/app-nav.ts` (+ test): bỏ tab Cài đặt.
- `packages/saas-core/src/auth/two-factor.ts` (+ test), `security/actions.ts`: `revokeOtherSessions`.
- `globals.css`, `vi.json`/`en.json`, codemap.d, quyết định, gap matrix, handoff, KT.

## Migration

Không có.

## Test viết trước

`settings-nav.test.ts`, `revokeOtherSessions` (đơn vị), cập nhật `app-nav.test.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib` · `pnpm --filter @flow/saas-core test:coverage`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (thao tác xóa phiên trong saas-core/auth).

## Rủi ro / câu hỏi cho chủ dự án

Còn thiếu dữ liệu thật để hiện: số mã dự phòng còn lại, ngày bật 2FA, ngày đổi mật khẩu gần nhất, IP/vị trí phiên → ghi gap `SETTINGS-SECURITY-DATA` (cần saas-core đọc `core.two_factors`/`accounts`; không đoán). Các mục Thông báo, Dữ liệu & Quyền riêng tư, Gói & Thanh toán chưa có tính năng → không hiện.

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

**Đã duyệt** (tự duyệt: mọi quyết định theo spec/Q-UIST1/Q-UIF1; không còn điểm chưa rõ).
