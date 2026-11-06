## Xuất dữ liệu workspace (`DATA-EXPORT`, FR-094)

Code đã xong-mock (kho tệp là thư mục cục bộ). Để bật đường dùng thật bạn cần:
1. Đặt `DATA_EXPORT_ENABLED=true` cho **cả web và worker** (mặc định TẮT) và `DATA_EXPORT_DIR=<thư mục ghi được, chỉ chủ tiến trình đọc>` cho **worker**. Chạy lại `pnpm --filter @flow/worker queue:install` để tạo hàng đợi `data-export` (staging/production qua CI có duyệt).
2. Muốn Owner **tải tệp / nhận link qua email** (`DATA-EXPORT-DELIVERY`): object storage (Cloudflare R2 hoặc S3, khóa truy cập chỉ ghi) + SMTP đã có ở mục email. Chưa có thì tệp chỉ nằm trên máy worker.
3. Quyết định riêng nếu muốn tệp có SĐT/email đầy đủ (hiện che theo Q-EXP1): cần luật sư xác nhận theo luật 91/2025/QH15.
Kiểm tay: KT-DEXP.
