# Kế hoạch `feat/composer-media-preview` — Xem trước ảnh/video trong Biên tập

Mã gap matrix: `POST-PUBLISHING` (sửa lỗi nhỏ sau #357).

**Tóm tắt:** Bản xem trước bài trong Biên tập chưa hiện ảnh/video đã tải lên. Thêm hiển thị theo bố cục kiểu Facebook (1 ảnh lớn, 2 ảnh chia đôi, từ 3 ảnh lưới có "+N", video có điều khiển). Đồng thời sửa lỗi chọn nhiều ảnh cùng lúc làm ảnh thứ hai bị chặn tốc độ (429): tải tuần tự và tự thử lại. Không đổi dữ liệu, không migration.

## Điểm chưa rõ
Không có.

## Tiêu chí nghiệm thu
1. Thêm/gỡ ảnh → xem trước cập nhật ngay; video có điều khiển; hơn 4 ảnh hiện "+N" — test render + kiểm bằng trình duyệt thật.
2. Chọn 2 ảnh cùng lúc → cả hai tải được (không báo "quá nhanh") — kiểm bằng trình duyệt thật.

## File sẽ sửa
`apps/web/src/components/composer/composer-studio.tsx` (+ test), `media-uploader.tsx`, i18n vi/en.
