# Bàn giao `feat/staging-db-loopback` (claude, làn a)

**Đã làm:** compose staging publish Postgres `127.0.0.1:${CF_STAGING_DB_PORT:-5434}:5432`; `env.cf-staging.example` thêm tên `CF_STAGING_DB_PORT`; `STAGING_SETUP.md` bỏ mục "Còn mở" về đường DB, thêm hướng dẫn `CF_STAGING_DB_HOSTS=127.0.0.1:5434`; `H5-CHECKLIST.md` cập nhật; test `scripts/lib/compose-ports.test.mjs` (hàm `compose-ports.mjs`, đọc theo dòng, không thêm thư viện) chặn mọi cổng postgres không bắt đầu `127.0.0.1:`. Không migration.

**Đã đọc + rút ra:** compose nền không có `ports` cho postgres; chỉ `docker-compose.dev.yml` publish `5433` (dev, ngoài phạm vi kiểm). Compose gộp `ports` theo kiểu nối thêm nên khối ở staging đủ.

**Còn lại (chỉ chủ dự án):** deploy compose staging, đặt `CF_STAGING_DB_HOSTS=127.0.0.1:5434` + secret URL cùng cổng; tạo dấu `cf.env=staging`. Chủ dự án xem dòng `ports` trước khi merge.
