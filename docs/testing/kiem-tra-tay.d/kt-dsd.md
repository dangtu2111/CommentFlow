## KT-DSD — Dữ liệu mẫu DEV (DEV-SEED-DEMO, feat-dev-seed-demo) — chưa thử

> Cần `.env` + máy ảo bật, DB `cf_dev` đã migrate. Chỉ dev. / Needs `.env` + dev VM; dev DB only.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `APP_ENV=staging pnpm dev:seed-demo` (hoặc trỏ `DATABASE_ADMIN_URL` sang `cf_test`) | Từ chối `[FORBIDDEN]`, không ghi gì |
| 2 | `pnpm dev:seed-demo` (APP_ENV=dev, `cf_dev`) | In cảnh báo "[MẪU]", số lượng, email + mật khẩu Owner/Staff MỘT lần |
| 3 | Chạy lại lệnh | "Workspace mẫu đã có — không làm gì", không tạo trùng |
| 4 | Đăng nhập Owner bằng email/mật khẩu vừa in | Vào được `/app`, thấy "[MẪU] Demo Shop", 2 kênh, 4 bài, 42 bình luận; trang Sản phẩm/Kiến thức/Tự động hóa có dữ liệu |
| 5 | `pnpm dev:seed-demo --reset` | Tạo lại, mật khẩu mới; mật khẩu cũ không còn đăng nhập được |
| 6 | Mọi tên kênh/sản phẩm/tác giả | Bắt đầu bằng "[MẪU]"; không SĐT/email thật |
