## KT-DSD2 — Dữ liệu mẫu DEV v2 (feat-dev-seed-v2) — chưa thử

> Cần `.env` + máy ảo bật, DB `cf_dev` đã migrate. Chỉ dev. Không in/ghi mật khẩu vào PR. / Dev DB only.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `pnpm dev:seed-demo --refresh` (workspace mẫu đã có) | In "Đã làm mới", số lượng từng bảng, **không** có mật khẩu mới; đăng nhập `owner.mau`/`staff.mau` bằng mật khẩu cũ (và 2FA nếu đã bật) vẫn được |
| 2 | Lần đầu sau v2: có thêm `staff2.mau@example.test` | Mật khẩu của tài khoản MỚI này in một lần (các tài khoản cũ không đổi) |
| 3 | `pnpm dev:seed-demo --into owner.thu2.<…>@…` (Owner có sẵn) | "Đã nạp"; workspace của Owner đó có dữ liệu mẫu; kênh/sản phẩm thật (nếu có) còn nguyên; mật khẩu Owner không đổi |
| 4 | Chạy lại `--into …` không `--refresh` | "đã có — không làm gì"; thêm `--refresh` thì làm mới, số lượng không đổi |
| 5 | Các trang Khách tiềm năng, Báo cáo, Nhật ký, Tự động hóa, Quy tắc spam, Kiến thức, Bài viết, Cài đặt, Tin nhắn | Có dữ liệu: 25 lead / 4 cột; báo cáo 28 ngày + 2 nhân viên; nhật ký 14 ngày; ma trận Tắt/Chạy thử/Tự động; 7 quy tắc spam; 15 FAQ + 2 phiên bản; 12 sản phẩm; 14 hội thoại (còn <2h / còn nhiều / quá 24h); hạn mức AI 71% |
| 6 | `APP_ENV=staging pnpm dev:seed-demo --refresh` hoặc trỏ sang `cf_test` | Từ chối `[FORBIDDEN]`, không ghi gì |
| 7 | Mọi tên/ghi chú mẫu | Bắt đầu bằng "[MẪU]"; không SĐT/email thật (số lead là số giả `0900…`, chỉ hiện 4 số cuối) |
