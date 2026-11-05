# Bàn giao `feat/fb-oauth` (claude, làn a)

## Đã làm
Toàn bộ FB-OAUTH ở mức "Xong-mock": client OAuth (`packages/connectors/src/facebook/oauth.ts` + fixture v27.0), tiện ích niêm phong cookie (`saas-core/auth/sealed-value.ts`), route `start`/`callback`, nghiệp vụ `connectFacebookPages` (đối chiếu `/me` → kênh+token mã hóa → subscribe đích danh + đọc lại → đặt `webhook_subscribed` qua `withJob`), trang `/app/channels` (chọn Page, Kết nối lại), banner có nút Kết nối lại, `instrumentation.ts` kiểm khóa khi khởi động (TOKEN-KEY-STARTUP-WEB), cờ `FB_OAUTH_ENABLED` mặc định tắt. Không migration.

## Đã đọc và rút ra
- `cf.channels.webhook_subscribed` chỉ hệ thống đặt được (trigger 0019/0020) → web dùng `withJob(workspaceId)` sau khi đã xác nhận (cần verifier xem kỹ đường này).
- `create_channel` upsert đặt `status='connected'` → "Kết nối lại" = chạy lại OAuth.
- Chưa có bảng `plans` → giới hạn kênh = `CHANNELS_LIMIT_DEFAULT` (mặc định 1).
- Tên biến dùng lại `META_*` (không thêm `FB_APP_*`), xem QUYET_DINH.

## Còn lại
- Thử với Meta App + Page thật (KT-014, `docs/CAN_BAN_CUNG_CAP.md` §1.4).
- Giới hạn gói thật khi có `plans`; `FB-BACKFILL`; `POST-HYDRATE`; đăng ký connector vào worker (`FB-CONNECTOR-REGISTER`).
- Ngắt kết nối (clearChannelToken) chưa có nút.
