## 2b. Tên sản phẩm, logo, tên miền, email gửi — `CFG-APPNAME` (FR-125, mã KT-018)

Code đã đọc cấu hình, đang chạy bằng **giá trị tạm** (`CommentFlow AI`, không logo/tên miền). Khi chốt tên (Q6), chỉ cần đặt biến, **không sửa code**:

| Biến | Ý nghĩa | Ghi chú |
|---|---|---|
| `APP_NAME` | Tên hiển thị (giao diện, tiêu đề trang, thư, tên trong app 2FA) | tối đa 60 ký tự |
| `APP_LOGO_URL` | Logo: đường dẫn gốc (`/brand/logo.svg`, file đặt ở `apps/web/public/brand/`) hoặc URL `https://…` | bỏ trống = biểu tượng mặc định |
| `APP_DOMAIN` | Tên miền công khai, ví dụ `app.ten-moi.vn` | chỉ tên miền, không `https://` |
| `APP_EMAIL_FROM` | Người gửi thư đầy đủ `Tên <no-reply@ten-moi.vn>` | bỏ trống = dựng từ `APP_NAME` + `APP_DOMAIN`; `SMTP_FROM` (nếu có) vẫn được ưu tiên |

Tên miền còn phải được xác minh (SPF/DKIM) ở nhà cung cấp email trước khi gửi thật.
