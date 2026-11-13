# Kế hoạch `feat/composer-media` — Backend ảnh và video cho Biên tập bài viết

Mã gap matrix: `POST-PUBLISHING` (mở rộng) · Quyết định: `docs/plans/quyet-dinh/qpub4.md` (chủ dự án chọn kho SeaweedFS S3 và đồng ý giới hạn 13/11/2026).

**Tóm tắt:** Owner tải tối đa 10 ảnh hoặc 1 video lên kho S3, xem trước, gắn vào bài; khi đăng, worker lấy file từ kho và đăng lên Facebook (ảnh: tải lên Page ở trạng thái chưa đăng rồi đính vào bài; video: một lệnh `/videos`). Rủi ro: đăng công khai không thu hồi được và file lạ/độc từ người dùng; chặn bằng kiểm loại theo nội dung, giới hạn kích thước, cô lập theo workspace, tối đa một lần (lỗi mạng khi tải video → `unknown`, không tự thử lại).

## Điểm chưa rõ
Không có.

## Tiêu chí nghiệm thu
1. Loại file nhận biết bằng nội dung; từ chối HTML/GIF/đuôi giả; ảnh ≤ 8MB, video ≤ 200MB; ≤ 10 ảnh hoặc 1 video, không trộn — test đơn vị + DB.
2. Tải lên chỉ Owner, cùng nguồn, truyền luồng lên S3, đếm byte khớp độ dài khai báo; chỉ ghi DB khi kho đã nhận — test đơn vị.
3. DB: đăng ký/đặt danh sách file qua hàm DEFINER (Staff 42501, workspace khác không thấy/không dùng được, file đã gắn bài khác 22023, trần 60 file chưa gắn) — test tích hợp.
4. Connector: ảnh = từng ảnh `published=false` rồi `feed` kèm `attached_media` đúng thứ tự; video = một lệnh `/videos`; lỗi tải ảnh = chắc chắn chưa đăng — test.
5. Worker: thiếu kho/mất file → `failed/media_unavailable` và không gọi Facebook; bài chỉ chữ không đổi hành vi — test.
6. Dọn file mồ côi theo giờ, chỉ ngữ cảnh trần cf_worker — test tích hợp.
7. Giao diện: tiến độ, xem trước, gỡ file, khóa nút khi đang tải, thông báo lỗi rõ; thiếu cấu hình → khóa kèm lý do — test render + kiểm tay KT-MEDIA.

## File sẽ đọc / sửa
Xem `docs/codemap.d/mien-composer-media.md`; thêm `infra/docker-compose.dev.yml` (publish cổng 8333), `env.example`, i18n vi/en, gói mới `packages/storage`.

## Migration
0092 (chỉ thêm 2 bảng + 4 hàm). Đường lùi ở đầu file; đã kiểm lùi trong giao dịch ROLLBACK.
