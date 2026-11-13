# Bản chạy thật cá nhân trên máy ảo (cf-staging, chỉ mình chủ dự án dùng)

**Tóm tắt.** Chạy CommentFlow thật (web + worker + Postgres + Valkey riêng, dữ liệu sạch) trên máy ảo, ra internet qua **Cloudflare Tunnel cố định**, dùng chung dịch vụ AI/kho ảnh của `cf-dev` trên cùng máy (LiteLLM, ml, SeaweedFS). Project Compose `cf-staging`. Repo **PUBLIC** nên **KHÔNG dùng runner GitHub tự host** (người lạ mở PR có thể chạy mã trên máy ảo): migration + deploy bằng **script trên máy ảo** `infra/scripts/staging-deploy.sh` (Q-SOLO2). Nếu sau này repo chuyển private thì có thể quay về đường CI có duyệt (mục cuối). Đây là "bản thật" của bạn; khi có khách thật sẽ dựng `production` riêng (VPS) theo `docs/15`.

Quyết định: `docs/plans/quyet-dinh/qsolo1.md` và `qsolo2.md`. Từng bước dựng nền (A–F) vẫn nằm ở `docs/STAGING_SETUP.md`; tài liệu này nói **phần riêng của bản cá nhân** và thứ tự làm.

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

### 1. Nền (một lần)
| Việc | Cách làm |
|---|---|
| Tên miền + Cloudflare Tunnel có tên | thêm tên miền vào Cloudflare, tạo Tunnel `commentflow`, route `app.<miền>` → `http://web:3000`, lấy token |
| File biến `.env.cf-staging` | `bash ~/CommentFlow/infra/scripts/gen-staging-env.sh --domain app.<miền>` (bạn chạy; khóa ngẫu nhiên MỚI, riêng cho bản thật) |
| Token Cloudflare | điền bằng lệnh nhập ẩn: `ssh -t cf 'read -rsp "Token: " T; echo; sed -i "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$T|" ~/cf-staging/.env.cf-staging; unset T'` |
| SMTP tạm (Mailpit của cf-dev) | `SMTP_HOST=host.docker.internal`, `SMTP_PORT=1025`, `SMTP_FROM="CommentFlow <no-reply@local>"`, `SMTP_SECURE=false`, **và `SMTP_USER`/`SMTP_PASS` đặt giá trị bất kỳ (ví dụ `mailpit`)**: web ở staging bắt buộc hai biến này khác rỗng; Mailpit chấp nhận mọi tài khoản |
| Bí mật dùng chung (khóa LiteLLM riêng, khóa S3, bucket) | `bash ~/CommentFlow/infra/scripts/staging-add-shared-secrets.sh --budget 10` |
| Meta | `META_APP_ID`, `META_APP_SECRET` (nhập ẩn, như token), `META_WEBHOOK_VERIFY_TOKEN` đã được script sinh sẵn; bật `FB_CONNECTOR_ENABLED=true` khi sẵn sàng |

### 2. Dựng lần đầu (trên máy ảo, repo công khai nên clone không cần khóa)
```
git clone https://github.com/dangtu2111/CommentFlow.git ~/cf-staging/src
bash ~/cf-staging/src/infra/scripts/staging-deploy.sh init                    # Postgres + Valkey, đánh dấu DB
bash ~/cf-staging/src/infra/scripts/staging-deploy.sh deploy --apply-migrations
```
`deploy --apply-migrations`: lấy mã `origin/main` → build web + worker → **sao lưu** → liệt kê migration chờ → **hỏi mã xác nhận** `commentflow@<số cuối>` (gõ tay) → áp → worker lên trước, web sau → bật cloudflared khi có token. Hàng đợi (pg-boss) tạo tự động ở lần chạy worker đầu; nếu cần tạo tay: `staging-deploy.sh queue --apply`.

Kiểm: `https://app.<miền>` hiện trang đăng nhập; `staging-deploy.sh status` đều `healthy`.

### 3. (Không dùng) GitHub Actions
Workflow `Migrate staging` / `Deploy staging` và runner tự host **không dùng** khi repo public (xem mục cuối).

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
2. Trên máy ảo (hoặc nhờ tôi chạy qua `ssh cf`): `bash ~/cf-staging/src/infra/scripts/staging-deploy.sh deploy` — build, sao lưu, **liệt kê migration chờ**. Nếu có migration: chạy lại với `--apply-migrations`, đọc danh sách rồi gõ mã xác nhận.
3. **Lùi bản:** `staging-deploy.sh rollback <sha12-cũ>` (image cũ còn trên máy; xem `docker images cf/web`). Migration KHÔNG tự lùi: mọi migration của dự án chỉ-thêm và có đường lùi viết ở đầu file; lùi DB là thao tác tay có chủ đích (khôi phục từ bản sao lưu).
4. Trước migration lớn: `bash ~/cf-staging/src/infra/scripts/staging-backup.sh` (deploy cũng tự sao lưu).

## Việc còn mở khi dùng thật
- **Thư thật:** Mailpit không gửi ra ngoài; quên mật khẩu/đổi email dùng được nhưng bạn đọc thư ở Mailpit.
- **Sao lưu ngoài máy ảo:** chép `~/cf-backups` sang nơi khác định kỳ.
- **Ổ đĩa:** máy ảo ~63 GB, còn ít; dọn image cũ (`docker image prune`) khi cần.
- **Langfuse:** để mặc định tắt; nếu bật cần khóa riêng (đừng dùng khóa của dev).

## Nếu sau này repo chuyển private
Có thể dùng đường CI có duyệt (`docs/STAGING_SETUP.md` A–F: runner `gh-runner`, environment `staging`/`staging-migrate`, workflow `Migrate staging` → `Deploy staging`). Chế độ `CF_STAGING_SOLO_OPERATOR` chỉ là lối đi cho tới lúc đó; khi có khách thật dựng `production` riêng trên VPS.
