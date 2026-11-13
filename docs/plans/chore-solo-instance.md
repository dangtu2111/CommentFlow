# Kế hoạch `chore/solo-instance` — Bản chạy thật cá nhân trên máy ảo

Mã gap matrix: `STAGING-DEPLOY` (mở rộng) · Quyết định: `docs/plans/quyet-dinh/qsolo1.md` (chủ dự án chốt 13/11/2026: tên miền + Cloudflare Tunnel, dữ liệu sạch, dùng chung dịch vụ AI, đường CI có duyệt).

**Tóm tắt:** Chuẩn bị phần trong repo để chủ dự án chạy CommentFlow thật trên máy ảo (chỉ mình dùng): nối web/worker của `cf-staging` với LiteLLM/ml/SeaweedFS của `cf-dev` cùng máy, thêm biến cho AI/ảnh-video/Facebook, script thêm bí mật dùng chung (không in giá trị) và script sao lưu, cùng hướng dẫn từng bước. Chưa chạm máy ảo hay GitHub: các bước cần tài nguyên của chủ dự án (tên miền, token Cloudflare, runner, environment GitHub) làm theo hướng dẫn. Rủi ro: dữ liệu thật trên một ổ đĩa còn ít chỗ, thiếu sao lưu ngoài máy; giảm bằng backup hằng ngày và nhắc chép ra ngoài.

## Điểm chưa rõ
Không có (các lựa chọn đã được chủ dự án trả lời).

## Tiêu chí nghiệm thu
1. `docker compose config` (compose nền + staging) hợp lệ khi đủ biến — kiểm trên máy ảo sau khi merge.
2. Cổng Postgres vẫn chỉ loopback; web vẫn không publish cổng — test `compose-ports` xanh.
3. Script không in bí mật, không ghi đè khóa có sẵn, từ chối ghi trong kho git — đọc mã + chạy thử không-bí-mật.
4. Hướng dẫn đủ để người chưa từng làm đi hết A→F và cập nhật dần/lùi bản.

## File sẽ sửa / tạo
`infra/docker-compose.staging.yml`, `infra/env.cf-staging.example`, `infra/scripts/staging-add-shared-secrets.sh`, `infra/scripts/staging-backup.sh`, `docs/staging/ban-chay-that-ca-nhan.md`, `docs/can-ban-cung-cap.d/ban-chay-that-ca-nhan.md`, codemap.
