# Kế hoạch `feat/channel-avatar` — Ảnh đại diện của kênh

Mã gap matrix: `CHANNELS` (bổ sung) · Quyết định tự chọn bên dưới.

**Tóm tắt:** Các kênh (Page Facebook) hiện chỉ hiện chữ cái đầu vì ảnh đại diện chưa bao giờ được lấy. Worker lấy ảnh đại diện của Page (`GET /{page-id}/picture`) ở mỗi lần kiểm kết nối và lưu vào cột `cf.channels.avatar_url` (đã có sẵn), rồi giao diện hiện ảnh ở Cài đặt → Kênh, danh sách kênh và bản xem trước trong Biên tập. Rủi ro thấp: ảnh đại diện Page là thông tin công khai; chỉ nhận URL https.

## Quyết định tự chọn
1. Dùng cột `avatar_url` đã có; thêm MỘT hàm DEFINER chỉ cho hệ thống (migration 0093, chỉ thêm, đường lùi `DROP FUNCTION`).
2. Làm mới ở mỗi lần kiểm kết nối (nút "Kiểm tra toàn bộ kết nối" và kiểm định kỳ) khi kết nối còn dùng được; lỗi lấy ảnh chỉ ghi cảnh báo, không đổi kết quả kiểm.
3. Ảnh mặc định (silhouette) hoặc URL không https → không lưu, giao diện giữ chữ cái đầu.

## Điểm chưa rõ
Không có.

## Tiêu chí nghiệm thu
1. Connector `fetchPagePicture` chỉ GET, trả URL https hoặc `null` — test.
2. Worker lưu ảnh sau kiểm ổn; kiểm hỏng thì không gọi; lỗi lấy ảnh không làm hỏng kiểm — test.
3. Hàm DB chỉ hệ thống ghi, URL phải https ≤ 2048, cô lập workspace — test tích hợp.
4. Giao diện hiện ảnh https (không hiện http) ở Cài đặt → Kênh, Biên tập (danh sách + xem trước) — test render.

## File sẽ sửa
`packages/db/migrations/0093_channel_avatar_function.sql`, `packages/db/src/{channel-tokens,queries/channels,runtime}.ts`, `packages/connectors/src/facebook/connector.ts`, `apps/worker/src/jobs/channel-check.ts` + `main.ts`, `apps/web/src/components/{settings/channels-hub,composer/composer-studio,composer/post-preview}.tsx`, `app/(guarded)/composer/page.tsx`.
