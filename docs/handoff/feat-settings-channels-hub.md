# Handoff feat/settings-channels-hub (claude)

**Đã làm:** Cài đặt › Kênh dựng lại theo Stitch `settings-channels` (thẻ số liệu thật, nhóm nền tảng, banner mất kết nối); "Cài đặt nâng cao" (ngôn ngữ trả lời), **Ngắt kết nối** (`cf.clear_channel_token`), **Kiểm tra toàn bộ kết nối** (job `channel-check` ở worker + migration 0063); thanh tab + đầu trang dùng chung cho 6 tab Cài đặt (`settings.pages.*`); thẻ mã dự phòng theo Stitch + **Xem lại mã / Tải .txt** (nhập lại mật khẩu, `getTOTPURI` kiểm mật khẩu); tải thiết kế `design/stitch/settings-channels.*`.

**File đã đọc + điều rút ra:**
- `cf.clear_channel_token` đã có sẵn (Owner/hệ thống) → ngắt kết nối không cần migration.
- Web (`cf_app`) không đọc được token Page (chỉ `withJob`) → kiểm kết nối PHẢI ở worker; connector Facebook có `getPageSubscription` → thêm `checkConnection?` tùy chọn vào `PlatformConnector`.
- Trigger `guard_channel_user_update` phải liệt kê mọi cột hệ thống → 0063 viết lại hàm kèm hai cột mới.
- Hàng đợi mới `channel-check` cần `pnpm --filter @flow/worker queue:install` (cf_owner) ở mỗi môi trường.
- `ChannelRow`/hộp thoại: `TwDialog` + Server Action; lint i18n chỉ nhận hàm tên `t` (dùng một `t` + tiền tố `hub.`).
- E2E hỗ trợ `e2e/support/flows.ts` tìm nút "Tạo lại mã dự phòng" → đã đổi sang `regenButton` ("Tạo lại 10 mã mới").

**Đã chạy thật:** test tích hợp DB (`channel-activity`, `channel-health-check`), `channel-check.test.ts` (7), `channel-disconnect.test.ts` (5), `backup-codes.test.ts` (15), `lib/channel-check.test.ts` (3); `pnpm precheck`, `lint:i18n`; E2E `gate0`/`settings-profile`/`settings-security` (xem kết quả trong PR).

**Tự kiểm nhạy cảm (không có kiểm chứng độc lập, không tự merge):** mật khẩu kiểm bằng plugin trước khi giải mã mã dự phòng, cùng hạn mức thử như tạo lại mã; nhật ký không chứa mã/mật khẩu; ngắt kết nối + kiểm kết nối do DB/worker ép quyền (Owner/hệ thống), `workspaceId` luôn từ phiên; job không log id kênh/id ngoài/nội dung lỗi; chỉ `TOKEN_EXPIRED`/`PERMISSION` hạ trạng thái.

**Còn lại:** "Đồng bộ lại" (Sắp có); lưu kênh Instagram khi kết nối Facebook (`IG-CHANNEL-CONNECT`, cần migration + Meta); OAuth TikTok; chọn 3/7/30 ngày khi kết nối (`FB-BACKFILL-UI`); cột "webhook gần nhất"; E2E riêng cho Kênh (cần Page giả); lỗi che email ở `admin-audit` (test ngẫu nhiên); việc tiếp theo chủ dự án giao: gắn chức năng đã có vào Cơ sở kiến thức.
