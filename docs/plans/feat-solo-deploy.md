# Kế hoạch `feat/solo-deploy` — Deploy bản chạy thật cá nhân bằng script (repo public)

Mã gap matrix: `STAGING-DEPLOY` (mở rộng) · Quyết định: `docs/plans/quyet-dinh/qsolo2.md` (chủ dự án chốt giữ repo public).

**Tóm tắt:** Repo public nên không được dùng runner GitHub tự host. Thêm script `staging-deploy.sh` chạy trên máy ảo (build, sao lưu, migration có mã xác nhận gõ tay, lên worker rồi web, lùi bản) và một chế độ `CF_STAGING_SOLO_OPERATOR=true` trong chốt migration staging để chạy ngoài GitHub Actions. Rủi ro: nới một chốt an toàn; giảm bằng việc giữ nguyên MỌI cổng khác (production luôn bị từ chối, đúng tên DB, host:cổng, dấu cf.env, mã xác nhận), chỉ bật khi đặt đúng chữ `true`, kèm test.

## Điểm chưa rõ
Không có.

## Tiêu chí nghiệm thu
1. Chế độ solo bỏ đúng một yêu cầu (GitHub Actions); production/APP_ENV/tên DB/host/xác nhận/URL thiếu vẫn bị từ chối; chỉ đúng chữ `true` mới bật; thông báo lỗi không lộ bí mật — test đơn vị.
2. Script: `bash -n` sạch; dry-run mặc định; áp migration chỉ khi gõ đúng mã; không in bí mật — kiểm trên máy ảo.
3. Dựng lần đầu và deploy chạy được trên máy ảo (init → deploy --apply-migrations → web healthy).

## File sẽ sửa
`packages/db/src/staging-migrate-guard.ts` (+ test), `staging-migrate.ts`, `cli-env.ts`, `infra/scripts/staging-deploy.sh`, `docs/staging/ban-chay-that-ca-nhan.md`.
