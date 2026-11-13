## COMPOSER-MEDIA — Bật tải ảnh/video cho bài đăng (chủ dự án)

Cần một kho S3 thật. Dùng SeaweedFS trên máy ảo (đang chạy cho Langfuse):

1. **Cập nhật máy ảo** (checkout trên máy ảo không tự cập nhật — `docs/workflows/may-ao-dong-bo.md`): `git pull` rồi chạy lại compose với file dev để publish cổng 8333: `docker compose -p cf-dev --env-file .env.cf-dev -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d seaweedfs`. Thêm cổng **8333** vào portproxy + tường lửa như các cổng khác (chỉ cho IP máy code).
2. **Tạo bucket** (ví dụ `cf-media`) bằng khóa S3 của máy ảo (`S3_ACCESS_KEY`/`S3_SECRET_KEY`): `aws --endpoint-url http://<IP máy ảo>:8333 s3 mb s3://cf-media` (hoặc công cụ S3 bất kỳ).
3. **Đặt biến ở CẢ web và worker** (`.env.local`): `MEDIA_S3_ENDPOINT`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY`, `MEDIA_S3_SECRET_KEY` (và tùy chọn `MEDIA_S3_REGION`); khởi động lại cả hai. Thiếu biến thì phần tải ảnh/video bị khóa kèm lý do, bài chỉ chữ vẫn đăng bình thường.
4. Đăng ảnh/video cần `FB_PUBLISH_ENABLED` bật và token Page có `pages_manage_posts` (cùng điều kiện đăng bài chữ). Video lớn đăng chậm (có thể vài phút); nếu mạng đứt lúc đang tải video lên Facebook, bài ghi "Chưa rõ kết quả" — kiểm trên Facebook trước khi đăng lại.
