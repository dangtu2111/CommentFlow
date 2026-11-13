## BAN-CHAY-THAT-CA-NHAN — Tài nguyên để chạy bản thật cá nhân trên máy ảo (chủ dự án)

Hướng dẫn đầy đủ: `docs/staging/ban-chay-that-ca-nhan.md`. Chỉ bạn làm được:
- **Tên miền** đã thêm vào Cloudflare (ví dụ `app.<miền-của-bạn>`) và một **Cloudflare Tunnel có tên** + token (`CLOUDFLARE_TUNNEL_TOKEN`), route tên miền → `http://web:3000`.
- **Runner GitHub tự host** trên máy ảo + hai environment `staging`, `staging-migrate` (người duyệt = bạn) + biến/secret (`docs/STAGING_SETUP.md` mục A, D).
- **Meta App**: đổi Valid OAuth Redirect URIs, App Domains và Webhook (object Page, trường `feed`) sang tên miền mới; tạo `META_WEBHOOK_VERIFY_TOKEN` mới cho bản thật.
- **SMTP thật** (Resend/Brevo, cần tên miền gửi thư xác minh SPF/DKIM) khi muốn nhận thư thật; tạm dùng Mailpit của cf-dev.
- **Sao lưu ngoài máy ảo**: chép `~/cf-backups` sang nơi khác định kỳ.
