## STAGING-DB-MARKER — Đánh dấu DB staging (chủ dự án chạy MỘT LẦN, quyền Postgres cao nhất)

- **Cần gì:** đặt tham số `cf.env = 'staging'` cho database staging. CLI migrate/cài hàng đợi staging TỪ CHỐI database không có dấu này (kể cả dry-run) và từ chối khi tên DB thật khác tên đã xác nhận — chốt chặn để không lỡ chạy lên nhầm DB. Code đã xong (`assertStagingDatabaseIdentity`); thiếu dấu thì job dừng với thông báo "chưa có dấu staging".
- **Vì sao chỉ bạn làm được:** `cf_owner` không đủ quyền đặt tham số tùy chỉnh ở mức database; cần role Postgres cao nhất (`postgres`). Agent không chạy lệnh ghi lên staging.
- **Lệnh (trên máy chạy staging, một lần):**

```bash
sudo -u gh-runner docker compose -p cf-staging exec postgres \
  psql -U postgres -d postgres -c "ALTER DATABASE commentflow SET cf.env = 'staging';"
```

- **Kiểm:** `SELECT setconfig FROM pg_db_role_setting s JOIN pg_database d ON d.oid=s.setdatabase WHERE d.datname='commentflow';` phải in `{cf.env=staging}`. (Thay `commentflow` nếu đổi `CF_DATABASES`.) Chi tiết: `docs/STAGING_SETUP.md` mục E1.
- **Không làm với:** DB dev (`cf_dev`), test (`cf_test`), production — dấu chỉ đặt cho DB staging.
