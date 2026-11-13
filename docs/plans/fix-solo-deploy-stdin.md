# Kế hoạch `fix/solo-deploy-stdin` — Sửa script deploy nuốt mã xác nhận

Mã gap matrix: `STAGING-DEPLOY` (sửa lỗi sau #365).

**Tóm tắt:** Khi chạy lần đầu `staging-deploy.sh deploy --apply-migrations` với mã xác nhận đưa qua stdin, `docker compose build/run` đọc stdin nên nuốt mã trước khi `read` kịp lấy, script dừng im lặng sau dòng "Sắp ÁP THẬT". Sửa: mọi lệnh docker compose chạy với `< /dev/null` và `run -T`. Ghi chú thêm: web ở staging bắt buộc `SMTP_USER`/`SMTP_PASS` khác rỗng (dùng giá trị tạm cho Mailpit). Không đổi dữ liệu.

## Điểm chưa rõ
Không có.

## Tiêu chí nghiệm thu
1. `bash -n` sạch; mã xác nhận đưa qua stdin được `read` nhận đúng — kiểm trên máy ảo ở lần deploy sau.

## File sẽ sửa
`infra/scripts/staging-deploy.sh`, `docs/staging/ban-chay-that-ca-nhan.md`.
