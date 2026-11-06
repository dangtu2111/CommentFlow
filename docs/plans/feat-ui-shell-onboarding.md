# Kế hoạch `feat-ui-shell-onboarding` — UI-FIDELITY nhóm 2: khung ứng dụng, onboarding, 403, 404, kênh mất kết nối

## Việc

Mã gap matrix: `UI-FIDELITY-SHELL` (ảnh `ui-shell`) · Spec: docs/08 §3, §7.2, §7.8 · Thiết kế: `comments.png` (khung), `onboarding.png`, `error-403.png`, `error-404.png`, `channel-disconnected.png`.

**Tóm tắt (UI-first, 06/11/2026):** làm cho giao diện khung ứng dụng và 4 màn phụ giống thiết kế Stitch hơn (thanh bên có biểu tượng + thẻ người dùng, đầu trang có hộp thông báo, banner kênh mất kết nối kiểu thanh cảnh báo, thanh các bước onboarding, trang 404/403 có bố cục thẻ, thẻ "Khôi phục kết nối" cho kênh lỗi). Không đổi logic nghiệp vụ, không migration. Mọi số liệu/huy hiệu không có thật trong thiết kế (Meta Tech Partner, 99.98%, hotline, "142 sản phẩm"…) bị bỏ — ghi ở Q-UIS1.

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-UIS1 (QUYET_DINH_CHO_DUYET.md).

## Tiêu chí nghiệm thu

1. Thanh bên: mỗi mục có biểu tượng, mục đang mở nổi bật bằng màu nút chính, cuối thanh có thẻ người dùng (tên viết tắt, vai trò) — kiểm bằng ảnh trước/sau 1440px + `userInitials` test.
2. Đầu trang: thương hiệu, bộ chuyển workspace, ngôn ngữ, hộp thông báo (chuông; chấm đỏ + danh sách khi có cảnh báo kênh thật, trống thì "Không có thông báo"), người dùng — kiểm bằng ảnh + `notification-model.test.ts`.
3. Banner kênh mất kết nối giữ nội dung cũ, kiểu thanh cảnh báo có biểu tượng — kiểm bằng ảnh.
4. Onboarding hiện thanh 5 bước (bước 1 đang chọn, còn lại chưa bắt đầu; bước 5 "có thể bỏ qua") — kiểm bằng `onboarding-steps.test.ts` + ảnh.
5. 404: thẻ giải thích + nút Quay lại / Về Hộp thư + 3 lối tắt tới trang có thật; không số liệu bịa — kiểm bằng ảnh + đọc code.
6. 403 (`/app/forbidden`): hiện workspace, người dùng, vai trò thật; hai cột "Bạn dùng được"/"Chỉ dành cho Owner" lấy từ `app-nav` (`splitNavByRole` test) — kiểm bằng test + ảnh. Staff vẫn nhận 404 ở trang Owner (không đổi `decideAppAccess`).
7. Kênh hết hạn/thu hồi/lỗi: trang Kênh hiện thẻ "Khôi phục kết nối" (nguyên nhân theo trạng thái, 2 bước, nút Kết nối lại chỉ khi `canReconnect`) — kiểm bằng ảnh + đọc code.
8. i18n vi/en đủ khóa, a11y (nhãn, `aria-current`, `role`) — `pnpm lint:i18n` + typecheck.
9. Công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`design/stitch/{comments,onboarding,error-403,error-404,channel-disconnected}.png` (đã đọc), `layout.tsx` (guarded), `shell-nav.tsx`, `app-nav.ts`, `workspace-switcher.tsx`, `system-banners.tsx`, `brand-logo.tsx`, `channels/page.tsx`, `onboarding/workspace/page.tsx`, `globals.css` (phần shell/banner), `tokens.css`, `vi.json` (shell/banners/channels).

## File sẽ sửa / tạo

- `apps/web/src/lib/user-initials.ts` (+test) · `lib/onboarding-steps.ts` (+test) · `lib/notification-model.ts` (+test) · `lib/app-nav.ts` thêm `splitNavByRole` (+test).
- `components/app/{shell-nav,notification-bell,user-card,onboarding-stepper,error-frame}.tsx`; `components/app/system-banners.tsx` (dùng chung bộ nạp); `server/shell-alerts.ts` (nạp một lần cho banner + chuông).
- `app/app/(guarded)/layout.tsx`, `app/not-found.tsx`, `app/app/forbidden/page.tsx`, `app/app/onboarding/workspace/page.tsx`, `app/app/(guarded)/channels/page.tsx`.
- `styles/globals.css` (token sẵn có), `packages/shared/src/i18n/messages/{vi,en}.json`.
- `docs/plans/ui-fidelity/ui-shell/*.png`, `docs/plans/ui-thieu-thiet-ke.md` (nếu thiếu), codemap/gap-matrix/MASTER/handoff/CAN_BAN_CUNG_CAP không đổi (không tài nguyên ngoài).

## Migration

Không có.

## Test viết trước

`user-initials`, `onboarding-steps`, `notification-model`, `splitNavByRole` (hàm thuần).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/token; `requireAppUser` giữ nguyên, trang 403 chỉ đọc ngữ cảnh đã kiểm).

## Rủi ro / câu hỏi cho chủ dự án

Nhiều khối trong thiết kế (SLA, "AI tự động", Dừng khẩn cấp, lọc nền tảng, số đếm mục điều hướng) chưa có dữ liệu → không dựng (đã có `SHELL-TOPBAR`).

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có (không thư viện mới; `lucide-react` đã dùng).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định theo spec/Q-UIS1).
