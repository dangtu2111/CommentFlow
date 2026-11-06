## KT-DEXP — Xuất dữ liệu workspace (DATA-EXPORT, FR-094, feat-data-export)

Điều kiện: staging có migration 0056, `queue:install` đã chạy lại, `DATA_EXPORT_ENABLED=true` (web + worker), `DATA_EXPORT_DIR` đặt.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Cờ TẮT: Owner mở Cài đặt → Dữ liệu & Quyền riêng tư, bấm "Yêu cầu xuất dữ liệu" | Thông báo "chưa mở"; không có dòng mới ở `core.data_exports` |
| 2 | Cờ BẬT: bấm lại | Thông báo "Đã ghi nhận yêu cầu xuất dữ liệu…"; trong vài giây dòng `core.data_exports` chuyển `pending` → `running` → `ready`, có `size_bytes`, `expires_at` = +7 ngày |
| 3 | Bấm lần nữa khi dòng còn `pending`/`running` | "Đang có một yêu cầu xuất dữ liệu chưa xong" |
| 4 | Mở tệp `$DATA_EXPORT_DIR/exports/<ws>/<id>.jsonl` trên máy worker | Mỗi dòng là JSON; dòng đầu `meta`, dòng cuối `summary`; KHÔNG thấy SĐT/email/tên khách thật (chỉ `[sđt]`, `[email]`, `kh_…`, `***1234`) |
| 5 | Đăng nhập Staff, mở trang đó | 404 (không vào được) |
| 6 | Sửa `expires_at` của dòng `ready` về quá khứ, chờ job retention (≤ 1 giờ) | Dòng thành `expired`, tệp bị xóa |
