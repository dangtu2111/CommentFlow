# Bản chạy thật cá nhân trên máy ảo (cf-staging, chỉ mình chủ dự án dùng)

**Tóm tắt.** Chạy CommentFlow thật (web + worker + Postgres + Valkey riêng, dữ liệu sạch) trên máy ảo, ra internet qua **Cloudflare Tunnel cố định**, dùng chung dịch vụ AI/kho ảnh của `cf-dev` trên cùng máy (LiteLLM, ml, SeaweedFS). Đi **đường CI có duyệt** của dự án: project Compose `cf-staging`, migration + deploy bằng GitHub Actions (self-hosted runner, bạn duyệt từng bước). Đây là "bản thật" của bạn; khi có khách thật sẽ dựng `production` riêng (VPS) theo `docs/15`.

Quyết định: `docs/plans/quyet-dinh/qsolo1.md`. Từng bước dựng nền (A–F) vẫn nằm ở `docs/STAGING_SETUP.md`; tài liệu này nói **phần riêng của bản cá nhân** và thứ tự làm.

## Kiến trúc

| Thành phần | Ở đâu | Ghi chú |
|---|---|---|
| web, worker | project `cf-staging` (image build tại máy ảo, thẻ = git sha) | web KHÔNG publish cổng; chỉ vào qua cloudflared |
| Postgres, Valkey | project `cf-staging` (riêng, volume riêng) | Postgres chỉ ở `127.0.0.1:5434` của máy ảo cho runner migrate |
| LiteLLM, ml, SeaweedFS | project `cf-dev` (dùng chung) | web/worker gọi qua `host.docker.internal` (cổng 4000/8001/8333 đã publish trên máy ảo) |
| Khóa LiteLLM | khóa ảo RIÊNG `cf-staging` (trần ngân sách) | tạo bằng `infra/scripts/staging-add-shared-secrets.sh` |
| Ảnh/video | bucket `cf-media-staging` (tách bucket dev) | cùng script tạo bucket |
| Email | tạm: Mailpit của cf-dev (`host.docker.internal:1025`, xem thư ở cổng 8025 của máy ảo) | KHÔNG gửi thư thật; muốn thư thật → SMTP thật (Resend/Brevo, cần tên miền gửi thư) |

Hệ quả khi dùng chung: tắt `cf-dev` hoặc `ml`/LiteLLM thì bản thật mất AI (web/worker vẫn chạy, tính năng AI báo chưa sẵn sàng); `cf-dev` và bản thật tranh RAM/ổ đĩa (ổ máy ảo còn ít: **theo dõi `df -h`**).

## Thứ tự làm

### 0. Việc tôi (Claude) làm trong repo — đã có trong PR này
- `docker-compose.staging.yml`: nối dịch vụ dùng chung + biến AI/ảnh/Facebook cho web và worker.
- `env.cf-staging.example`, `staging-add-shared-secrets.sh`, `staging-backup.sh`.

### 1. Bạn: nền theo `docs/STAGING_SETUP.md`
| Bước | Việc | Ghi chú riêng cho bản cá nhân |
|---|---|---|
| A | Cài runner GitHub tự host (user `gh-runner`, nhãn `cf-staging`) | máy ảo; repo phải private |
| B | `infra/scripts/gen-staging-env.sh --domain <tên-miền>` | tên miền = địa chỉ web của bạn, ví dụ `app.<miền-của-bạn>` |
| C | Cloudflare: thêm tên miền, tạo Tunnel có tên, route `<tên-miền>` → `http://web:3000`, lấy token | điền `CLOUDFLARE_TUNNEL_TOKEN` vào `.env.cf-staging` |
| C8 | SMTP | tạm dùng Mailpit: `SMTP_HOST=host.docker.internal`, `SMTP_PORT=1025`, `SMTP_FROM=CommentFlow <no-reply@local>`, `SMTP_SECURE=false` |
| D | Biến/secret/environment trên GitHub | `CF_STAGING_DB_NAME=commentflow`, `CF_STAGING_DB_HOSTS=127.0.0.1:5434`, người duyệt = bạn |

### 2. Bạn chạy trên máy ảo (hoặc nhờ tôi chạy qua `ssh cf` khi bạn đồng ý; không in bí mật)
```
bash ~/CommentFlow/infra/scripts/staging-add-shared-secrets.sh --budget 10
```
Thêm `LITELLM_API_KEY` riêng (trần 10 USD/30 ngày), `MEDIA_S3_*`, tạo bucket `cf-media-staging`. Rồi mở `.env.cf-staging` (quyền 600) và điền, theo nhu cầu:
```
META_APP_ID=...            META_APP_SECRET=...        META_WEBHOOK_VERIFY_TOKEN=<chuỗi mới, KHÔNG dùng lại của dev>
FB_CONNECTOR_ENABLED=true  FB_PUBLISH_ENABLED=false   # bật FB_PUBLISH_ENABLED=true sau khi thử ổn trên Page thử
```

### 3. Migration rồi deploy (GitHub → Actions, bạn duyệt)
1. `Migrate staging`: nhập `staging` và mã xác nhận `commentflow@<số migration cuối>` (số cuối: `ls packages/db/migrations | tail -2`). Job **dry-run** → đọc danh sách migration chờ → duyệt job **migrate**.
2. `Deploy staging`: nhập `staging` → build image, chạy worker trước rồi web, kiểm sức khỏe.
3. Kiểm: `https://<tên-miền>` mở được trang đăng nhập; `docker compose -p cf-staging ps` đều `healthy`.

### 4. Lần đầu dùng
1. Đăng ký tài khoản Owner (thư xác minh đọc ở Mailpit `http://<IP máy ảo>:8025`), tạo workspace.
2. Cài đặt → Kênh → khối System User: dán token System User (có `pages_manage_posts`), kết nối Page.
3. Meta App (chỉ MỘT app Meta: bạn đổi URL từ dev sang bản thật): **Valid OAuth Redirect URIs** = `https://<tên-miền>/api/channels/facebook/callback`; **App Domains** = tên miền; **Webhooks → Page** → Callback URL `https://<tên-miền>/api/webhooks/meta` + Verify token = `META_WEBHOOK_VERIFY_TOKEN` của bản thật, đăng ký trường `feed`.
4. Bật cờ AI cho workspace của bạn (cờ DB theo workspace; xem mục dưới).
5. Thêm cron sao lưu: `crontab -e` → `0 3 * * * bash $HOME/CommentFlow/infra/scripts/staging-backup.sh >> $HOME/cf-backups/backup.log 2>&1`.

### Bật cờ AI cho workspace (một lần)
Cờ ở bảng `core.feature_flag_overrides` (không có giao diện cho Owner). Chạy trên máy ảo, thay `<workspace-id>` bằng id workspace của bạn (đọc ở `core.workspaces`):
```
docker exec cf-staging-postgres-1 psql -U postgres -d commentflow -c "select id, name from core.workspaces"
```
rồi, với mỗi cờ cần (`cf.ai.classify`, `cf.ai.draft`, `cf.ai.rewrite`, `cf.ai.caption`, `cf.ai.distill`, `cf.ai.guard_facts`, `cf.pipeline.v2`):
```
insert into core.feature_flag_overrides (flag_key, workspace_id, enabled, reason) values ('<cờ>', '<workspace-id>', true, 'bản chạy thật cá nhân') on conflict (flag_key, workspace_id) do update set enabled = true;
```
(Cờ cần có dòng định nghĩa trong `core.feature_flags`; nếu thiếu thì thêm theo mẫu của cờ `cf.ai.draft`.)

## Cập nhật dần (mỗi tính năng mới)
1. Merge PR vào `main` như hiện nay (CI xanh).
2. GitHub → Actions → `Migrate staging` (nếu PR có migration) → duyệt dry-run, đọc, duyệt migrate.
3. `Deploy staging` → duyệt. Worker lên trước, web sau; image cũ vẫn còn trên máy.
4. **Lùi bản:** chạy lại `Deploy staging` từ **commit cũ** (chọn nhánh/commit cũ khi bấm Run; hoặc `IMAGE_TAG=<sha-cũ>` rồi `docker compose ... up -d --no-build web worker` trên máy ảo). Migration KHÔNG tự lùi: mọi migration của dự án chỉ-thêm và có đường lùi viết ở đầu file; lùi DB là thao tác tay có chủ đích.
5. Trước migration lớn: `bash ~/CommentFlow/infra/scripts/staging-backup.sh`.

## Việc còn mở khi dùng thật
- **Thư thật:** Mailpit không gửi ra ngoài; quên mật khẩu/đổi email dùng được nhưng bạn đọc thư ở Mailpit.
- **Sao lưu ngoài máy ảo:** chép `~/cf-backups` sang nơi khác định kỳ.
- **Ổ đĩa:** máy ảo ~63 GB, còn ít; dọn image cũ (`docker image prune`) khi cần.
- **Langfuse:** để mặc định tắt; nếu bật cần khóa riêng (đừng dùng khóa của dev).
