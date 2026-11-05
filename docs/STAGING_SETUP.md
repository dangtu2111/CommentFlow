# Hướng dẫn dựng staging — từng bước cho chủ dự án

> Đã đồng bộ với `main` sau khi PR #37 (`chore/h5-staging-prep`) và #39 (`STAGING-MIGRATE`) vào. Tài liệu tham chiếu `infra/docker-compose.staging.yml`, `infra/env.cf-staging.example`, `.github/workflows/deploy-staging.yml`, `.github/workflows/migrate-staging.yml`, `docs/staging/H5-CHECKLIST.md`.

**Tóm tắt.** "Staging" là bản chạy thử của CommentFlow trên máy ảo Ubuntu (project Docker Compose `cf-staging`), ra internet qua Cloudflare Tunnel, để thử với Page Facebook thật trước khi lên production. Tài liệu này dẫn bạn làm theo thứ tự: cài "người làm việc" của GitHub trên máy ảo (runner), sinh file bí mật ngay trên máy ảo, nối tên miền Cloudflare, bật các công tắc trên GitHub, rồi kiểm tra sau khi deploy. **Rủi ro chính:** (1) mất `TOKEN_ENC_KEYS` = mọi kênh phải kết nối lại; (2) runner tự host chạy lệnh trên máy ảo của bạn nên phải cài đúng cách (dưới đây).

**Ranh giới hiện tại (chưa có tên miền):** bạn làm **A, B, D** (và E khi sẵn sàng), rồi **DỪNG trước bước C**. Chưa deploy web/worker lên staging cho tới khi xong C và bước SMTP (C8), vì compose bắt buộc có `BETTER_AUTH_URL` và `SMTP_*`.

Mọi lệnh gõ **trên máy ảo** (qua `ssh cf`) trừ khi ghi rõ "trên GitHub", "trên Cloudflare" hoặc "máy code". **Không dán bí mật vào chat, issue, log hay commit.** Máy code (Windows) không dùng Docker.

## Việc bạn cần làm

| # | Việc | Ở đâu | Trạng thái |
|---|---|---|---|
| A | Cài runner GitHub tự host, chạy như service, user riêng không root (chỉ cho repo private) | Máy ảo + GitHub | Làm được ngay |
| B | Sinh file `.env.cf-staging` bằng script `infra/scripts/gen-staging-env.sh` | Máy ảo | Làm được ngay |
| C | Tên miền + Cloudflare Tunnel + token; rồi SMTP gửi thư (C8) | Cloudflare + nhà cung cấp SMTP | **DỪNG ở đây** — cần tên miền (chưa có) |
| D | Biến GitHub (`DEPLOY_STAGING_ENABLED`, `STAGING_ENV_FILE`) + environment `staging`, `staging-migrate` | GitHub | Làm được ngay (nhưng chỉ bật `DEPLOY_STAGING_ENABLED` ở cuối) |
| E | Migration + cài hàng đợi lên staging (`pnpm db:migrate:staging`) | GitHub Actions + máy ảo | Đã có (PR #39); cần A, B, D |
| F | Kiểm sau deploy: health, đăng nhập thử, worker dọn payload | Máy ảo + trình duyệt | Sau khi A–E xong |

Thứ tự: A → B → D (trừ công tắc bật) → **dừng** → khi có tên miền: C (gồm C8 SMTP) → E → deploy lần đầu → F.

## Đã quyết (chủ dự án) và việc còn mở

**Đã quyết:**
1. **Repo private** (đã kiểm). Runner tự host **chỉ dùng cho repo private**. Nếu repo bị chuyển sang public: **dừng ngay** — `sudo ./svc.sh stop` rồi gỡ runner (Settings → Actions → Runners → Remove) và xóa `DEPLOY_STAGING_ENABLED`.
2. **Chưa có tên miền:** làm A, B, D trước, dừng trước C.
3. **SMTP staging:** dùng gói miễn phí của Resend hoặc Brevo qua SMTP chuẩn, cấu hình bằng biến `SMTP_HOST/PORT/FROM/SECURE/USER/PASS`; cần tên miền gửi thư đã xác minh SPF/DKIM nên làm **sau** tên miền (C8). **Không có Mailpit** trong `cf-staging`.
4. **Người duyệt** `staging` và `staging-migrate`: **chỉ chủ dự án**.
5. **Khóa:** khóa staging sinh trên máy ảo, chỉ nằm ở đó + **một** bản sao trong trình quản lý mật khẩu của chủ dự án. Khóa dev chỉ ở máy code. **Không chép chéo** giữa hai môi trường.

**Còn mở — cần bạn quyết định:**
- **Tên miền staging** (ví dụ `staging.<tên-miền-của-bạn>`) và **tên miền gửi thư** (có thể cùng miền gốc).
- **TLS của Postgres staging:** nếu URL có `sslmode` thì CLI chỉ chấp nhận `require`, `verify-ca`, `verify-full`; để trống thì được, nhưng nên có TLS khi không đi qua loopback.

**Đường runner → Postgres staging (đã có trong repo):** compose staging publish Postgres **chỉ ở `127.0.0.1`** của máy ảo (`127.0.0.1:${CF_STAGING_DB_PORT:-5434}:5432`; web vẫn không publish cổng nào). Runner `cf-staging` chạy cùng máy ảo nên dùng `CF_STAGING_DB_HOSTS=127.0.0.1:5434` và URL secret `…@127.0.0.1:5434/<tên-db>` (đi loopback nên không cần `sslmode`). Nếu đổi `CF_STAGING_DB_PORT` trong `.env.cf-staging` thì đổi cả hai chỗ này cho khớp. Test `scripts/lib/compose-ports.test.mjs` chặn việc đổi thành `0.0.0.0`; **đừng tự mở cổng DB ra ngoài loopback.** Cổng chỉ có hiệu lực sau khi chạy lại `docker compose … up -d` (compose staging chưa chạy ở đâu cả đến khi bạn deploy lần đầu).

---

## A. Cài runner GitHub tự host

**Mục đích:** để workflow `Deploy staging` chạy lệnh `docker compose` ngay trên máy ảo. Workflow chọn runner theo nhãn `self-hosted, linux, cf-staging`.

**Điều kiện tiên quyết:** runner tự host **chỉ dùng cho repo private** (đã kiểm). Nếu repo chuyển public: dừng và gỡ runner ngay (xem mục "Đã quyết" 1).

**Nguyên tắc an toàn:** user riêng `gh-runner` (không root, không `sudo`), chạy như service, chỉ dùng cho hai environment `staging` / `staging-migrate`. Lưu ý trung thực: user trong nhóm `docker` gần như có quyền root trên máy (có thể chạy container gắn ổ đĩa). Vì vậy runner chỉ được dùng bởi workflow bạn kiểm soát, repo phải private, và máy ảo này không chứa gì ngoài dev/staging.

### A1. Tạo user riêng

```bash
sudo adduser --disabled-password --gecos "" gh-runner
sudo usermod -aG docker gh-runner
```

Kiểm tra:

```bash
id gh-runner
sudo -u gh-runner docker ps
sudo -l -U gh-runner
```

Mong đợi: dòng `id` có `docker` trong `groups`; `docker ps` in bảng (có thể rỗng) không lỗi quyền; `sudo -l` báo `User gh-runner is not allowed to run sudo`.

### A2. Lấy lệnh cài trên GitHub

Trên GitHub: repo → **Settings → Actions → Runners → New self-hosted runner** → chọn **Linux**, **x64**. Trang hiện các lệnh `curl`/`tar` (đúng phiên bản mới nhất) và lệnh `./config.sh --url … --token …`. **Token trên trang chỉ sống ~1 giờ và là bí mật — không dán đi đâu.**

### A3. Cài (chạy với user `gh-runner`)

```bash
sudo -u gh-runner -H bash -c 'mkdir -p ~/actions-runner'
sudo -u gh-runner -H -i
cd ~/actions-runner
# Dán 3 lệnh "Download" (curl, kiểm hash, tar) từ trang GitHub ở bước A2
./config.sh --url https://github.com/<chủ>/<repo> --token <TOKEN-TỪ-TRANG-GITHUB> \
  --name cf-staging-vm --labels cf-staging --work _work --unattended
exit
```

`--labels cf-staging` cộng thêm vào nhãn mặc định `self-hosted, linux, x64` nên đủ bộ nhãn workflow cần. Đừng đặt thêm nhãn chung chung (như `ubuntu-latest`) để workflow khác không vô tình chạy trên máy này.

### A4. Chạy như service

```bash
cd /home/gh-runner/actions-runner
sudo ./svc.sh install gh-runner
sudo ./svc.sh start
sudo ./svc.sh status
```

### A5. Kiểm tra

```bash
sudo ./svc.sh status | head -5
ps -o user=,cmd= -C Runner.Listener
```

Mong đợi: `Active: active (running)`; cột user của `Runner.Listener` là `gh-runner` (không phải `root`). Trên GitHub, trang Runners hiện `cf-staging-vm` trạng thái **Idle** (chấm xanh) với nhãn `self-hosted`, `Linux`, `X64`, `cf-staging`.

### A6. Hạn chế quyền (làm hết)

- Trên GitHub → **Settings → Actions → Runners**: nếu repo thuộc tổ chức, đặt runner vào một **Runner group** chỉ cho repo này.
- **Settings → Actions → General**: "Fork pull request workflows" = yêu cầu duyệt; "Workflow permissions" = *Read repository contents*.
- Chỉ workflow `deploy-staging.yml` (và workflow migrate ở mục E) được dùng nhãn `cf-staging`. Mọi job chạy trên runner này phải khai `environment: staging` hoặc `staging-migrate` (có người duyệt). GitHub không khóa cứng runner theo environment — bảo vệ nằm ở: environment có Required reviewers + không workflow nào khác dùng nhãn `cf-staging`. Mỗi lần thêm workflow mới trong PR, kiểm `runs-on`.
- Kiểm định kỳ (và mỗi khi đổi cài đặt repo) rằng repo vẫn **private**: `gh repo view --json visibility --jq .visibility` (máy code) → in `PRIVATE`.
- Không đặt token/khóa cá nhân của bạn trong thư mục `/home/gh-runner` ngoài file `cf-staging/.env.cf-staging`.

---

## B. Tạo `.env.cf-staging` bằng script sinh bí mật

**Mục đích:** file biến của staging, bí mật **mới**, chỉ nằm trên máy ảo, **không dùng lại khóa dev**. Script `infra/scripts/gen-staging-env.sh` không in bí mật ra màn hình, đặt quyền 600, không ghi đè nếu file đã có, từ chối ghi vào trong repo git.

**Vì sao chạy bằng user `gh-runner`:** runner đọc file này lúc deploy; file thuộc `gh-runner` với quyền 600 thì tài khoản khác không đọc được. Ta đưa script vào qua stdin nên không cần cấp quyền đọc clone của bạn.

### B1. Kiểm script có trên máy ảo

```bash
cd ~/CommentFlow && git pull && ls -l infra/scripts/gen-staging-env.sh
bash -n infra/scripts/gen-staging-env.sh && echo "cú pháp OK"
```

Mong đợi: file tồn tại, in `cú pháp OK`.

### B2. Chạy script

Thay `--domain` bằng tên miền staging (bỏ trống nếu chưa có) và `--email` bằng email của bạn (để đăng nhập Langfuse):

```bash
sudo -u gh-runner -H bash -s -- --domain staging.example.com --email ban@example.com \
  < ~/CommentFlow/infra/scripts/gen-staging-env.sh
```

Mong đợi: chỉ in vài dòng — `Đã tạo /home/gh-runner/cf-staging/.env.cf-staging (quyền 600).` và danh sách **tên** biến còn trống. Không in giá trị bí mật nào. Chạy lần hai sẽ báo `Đã có … — không ghi đè` (đúng thiết kế).

> Chỉ khi staging **chưa có dữ liệu thật** và bạn muốn tạo lại từ đầu mới thêm `--overwrite` (sẽ sao lưu bản cũ). Tạo lại khi đã có dữ liệu = mật khẩu DB không khớp volume Postgres và `TOKEN_ENC_KEYS` mới không giải mã được token cũ.

### B3. Kiểm quyền và định dạng (không in bí mật)

```bash
sudo ls -l /home/gh-runner/cf-staging/.env.cf-staging
sudo -u gh-runner grep -c '=' /home/gh-runner/cf-staging/.env.cf-staging
sudo -u gh-runner grep -E '^TOKEN_ENC_KEYS=v1:[0-9a-f]{64}$' /home/gh-runner/cf-staging/.env.cf-staging >/dev/null && echo "TOKEN_ENC_KEYS đúng định dạng"
sudo -u gh-runner grep -E '^BETTER_AUTH_SECRET=[0-9a-f]{64}$' /home/gh-runner/cf-staging/.env.cf-staging >/dev/null && echo "BETTER_AUTH_SECRET đúng định dạng"
```

Mong đợi: `-rw------- 1 gh-runner gh-runner …`; số dòng có `=` khoảng 50; hai dòng "đúng định dạng". (Tuyệt đối không `cat` file lên màn hình khi chia sẻ màn hình/ghi hình.)

### B4. Điền các biến còn trống

Mở bằng `sudo -u gh-runner -H nano /home/gh-runner/cf-staging/.env.cf-staging` và điền:

| Biến | Lấy ở đâu |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS` | **Để sau tên miền (C8).** Trước đó, chỉ nếu cần dựng thử cấu hình/chạy E, có thể điền giá trị tạm không dùng được (`SMTP_HOST=localhost`, `SMTP_PORT=25`, `SMTP_FROM=tam@localhost`) và **nhớ thay ở C8** |
| `META_APP_ID`, `META_APP_SECRET` | Meta App dev riêng cho staging (`docs/CAN_BAN_CUNG_CAP.md` §1) — có thể để trống đến khi thử Facebook thật |
| `CLOUDFLARE_TUNNEL_TOKEN` | Mục C |
| `BETTER_AUTH_URL`, `LANGFUSE_INIT_USER_EMAIL` | Nếu lúc chạy script chưa có `--domain` / `--email` |

`META_WEBHOOK_VERIFY_TOKEN` đã được sinh sẵn — dán **cùng giá trị** vào ô "Verify token" ở Meta khi đăng ký webhook (xem bằng `sudo -u gh-runner grep META_WEBHOOK_VERIFY_TOKEN …` trong terminal riêng tư). `IMAGE_TAG` để trống (workflow tự đặt). `CLIENT_IP_SOURCE` để `none` cho đến khi tunnel chạy (mục C6). Khóa dev không bao giờ chép vào file này, và khóa staging không chép về máy code.

`BETTER_AUTH_URL` và `SMTP_HOST/PORT/FROM` bắt buộc không trống (compose báo lỗi nếu trống). Kiểm bằng cách dựng thử cấu hình (không chạy gì):

```bash
cd ~/CommentFlow && sudo -u gh-runner docker compose --env-file /home/gh-runner/cf-staging/.env.cf-staging \
  -f infra/docker-compose.yml -f infra/docker-compose.staging.yml config --quiet && echo "compose config OK"
```

(Lệnh này đọc `infra/*.yml` trong clone của bạn — nếu `gh-runner` không đọc được thư mục clone, bỏ qua; workflow ở GitHub sẽ chạy đúng bước kiểm này.) Mong đợi: `compose config OK`; nếu thiếu biến sẽ báo đúng tên biến (không in giá trị).

### B5. Sao lưu `TOKEN_ENC_KEYS`

Mở file, copy **riêng** dòng `TOKEN_ENC_KEYS=…` vào trình quản lý mật khẩu của bạn (tách khỏi nơi sao lưu DB). Đây là **bản sao duy nhất** ngoài máy ảo; không gửi qua chat/email, không đặt ở máy code. Xoay khóa sau này: thêm `,v2:<hex mới>` phía sau, không xóa `v1` cho tới khi mọi kênh đã mã hóa lại (`docs/CAN_BAN_CUNG_CAP.md` §1.3 mục 4).

---

## C. Tên miền + Cloudflare Tunnel (cần tên miền)

Làm trên Cloudflare, sau khi có tên miền. Dịch vụ `cloudflared` trong compose chỉ chạy khi bật profile `tunnel`.

1. Đăng nhập <https://dash.cloudflare.com> → **Add a site** → nhập tên miền → chọn gói Free → đổi **nameserver** tại nơi mua tên miền sang hai nameserver Cloudflare đưa. Chờ trạng thái **Active**.
   - Kiểm: `nslookup -type=NS <tên-miền-của-bạn>` (máy bất kỳ) in ra nameserver `*.ns.cloudflare.com`.
2. Vào **Zero Trust** (menu trái) → lần đầu sẽ hỏi tên team và gói Free → xác nhận. (Có thể yêu cầu thẻ để xác minh, không bị tính phí ở gói Free.)
3. **Networks → Tunnels → Create a tunnel** → chọn **Cloudflared** → đặt tên `cf-staging` → **Save tunnel**.
4. Ở màn "Install and run connector": **không chạy lệnh nó đưa**. Chỉ **copy token** (chuỗi dài sau `--token` hoặc `service install`). Token là bí mật.
5. Tab **Public Hostname** (hoặc *Published application routes*) → **Add**: Subdomain `staging`, Domain = tên miền của bạn, Type `HTTP`, URL `web:3000` → **Save**. (`web` là tên dịch vụ trong mạng Compose; không phải `localhost`.)
6. Trên máy ảo, điền token: `sudo -u gh-runner -H nano /home/gh-runner/cf-staging/.env.cf-staging` → `CLOUDFLARE_TUNNEL_TOKEN=<token>`; đặt `BETTER_AUTH_URL=https://staging.<tên-miền>`; **chỉ sau khi tunnel chạy** mới đặt `CLIENT_IP_SOURCE=cf-connecting-ip` (an toàn chỉ khi web không mở cổng ra ngoài — ADR 004 §2; compose staging cố ý không publish cổng).
7. Bật tunnel: cần chạy compose với `--profile tunnel`. **Lưu ý:** workflow `deploy-staging.yml` của #37 chưa có `--profile tunnel`; bật tay lần đầu trên máy ảo (chạy với user `gh-runner`) hoặc đề xuất thêm vào workflow ở nhánh sau:
   ```bash
   cd /home/gh-runner/actions-runner/_work/<repo>/<repo>   # thư mục checkout của runner sau lần deploy đầu
   sudo -u gh-runner docker compose -p cf-staging --env-file /home/gh-runner/cf-staging/.env.cf-staging \
     -f infra/docker-compose.yml -f infra/docker-compose.staging.yml --profile tunnel up -d cloudflared
   ```

8. **SMTP gửi thư (làm SAU khi có tên miền).** Dùng gói miễn phí của **Resend** hoặc **Brevo** (SMTP chuẩn):
   1. Tạo tài khoản → thêm **tên miền gửi thư** của bạn → nhà cung cấp đưa các bản ghi DNS (SPF, DKIM, có thể DMARC) → thêm đúng vào **Cloudflare → DNS** (TXT/CNAME; CNAME đặt *DNS only*) → bấm **Verify** đến khi hiện *Verified*.
   2. Lấy thông tin SMTP trong trang nhà cung cấp, điền vào file trên máy ảo: `SMTP_HOST`, `SMTP_PORT` (587 với `SMTP_SECURE=false`, hoặc 465 với `SMTP_SECURE=true`), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (địa chỉ thuộc tên miền đã xác minh, ví dụ `CommentFlow <no-reply@<tên-miền>>`). Giá trị cụ thể lấy ở trang SMTP của nhà cung cấp — không đoán.
   3. Không dùng Mailpit ở staging.

### Kiểm tra C

```bash
sudo -u gh-runner docker compose -p cf-staging ps cloudflared
sudo -u gh-runner docker compose -p cf-staging logs --tail 20 cloudflared | grep -i "registered tunnel connection"
curl -sS -o /dev/null -w "%{http_code}\n" https://staging.<tên-miền>/api/health
```

Mong đợi: `cloudflared` trạng thái `running`; log có dòng `Registered tunnel connection`; `curl` in `200`. Trên Zero Trust → Tunnels, `cf-staging` hiện **Healthy**. Kiểm SMTP: nhà cung cấp hiện tên miền *Verified*, và thư xác minh ở F2 đến được hộp thư.

---

## D. Biến và environment trên GitHub

Làm trên GitHub, repo → **Settings**.

### D1. Hai environment (Settings → Environments → New environment)

| Tên | Dùng cho | Required reviewers |
|---|---|---|
| `staging` | Job deploy (`deploy-staging.yml`) | **Chỉ bạn** (chủ dự án) |
| `staging-migrate` | Job migration + cài hàng đợi (`migrate-staging.yml`, mục E) | **Chỉ bạn** |

Cho mỗi environment: bật **Required reviewers** → thêm **chỉ chính bạn**; để **Prevent self-review** TẮT nếu bạn là người duy nhất (bật lên thì bạn không tự duyệt được lần chạy do chính mình kích hoạt). Để **Deployment branches** = *Selected branches* → `main`. Environment `staging` không chứa secret — bí mật nằm trên máy ảo. Riêng `staging-migrate` chứa một secret và hai variable (D2b).

Kiểm: trang Environments liệt kê `staging` và `staging-migrate`, mỗi cái ghi "Required reviewers". (Trên máy code: `gh api repos/<chủ>/<repo>/environments --jq '.environments[].name'` → in hai tên.)

### D2. Biến repo (Settings → Secrets and variables → Actions → tab **Variables** → New repository variable)

| Tên | Giá trị | Ghi chú |
|---|---|---|
| `STAGING_ENV_FILE` | `/home/gh-runner/cf-staging/.env.cf-staging` | Đường dẫn file trên máy ảo (không phải bí mật) |
| `DEPLOY_STAGING_ENABLED` | `true` | **Tạo cuối cùng**, khi A, B (và E) đã xong. Xóa biến hoặc đổi khác `true` = tắt deploy |

Kiểm (máy code): `gh variable list` → thấy hai biến. Với `DEPLOY_STAGING_ENABLED` chưa tạo, workflow bị bỏ qua (an toàn).

### D2b. Secret và variable của environment `staging-migrate` (cho mục E)

Settings → Environments → `staging-migrate`:

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `STAGING_DATABASE_ADMIN_URL` | `postgresql://cf_owner:<CF_OWNER_PASSWORD>@<host>:<cổng>/<tên-db>?sslmode=require` — **phải ghi cổng**; `sslmode` nếu có chỉ được `require`, `verify-ca`, `verify-full`; không thêm tham số khác ngoài `connect_timeout`, `application_name`. `<CF_OWNER_PASSWORD>` lấy từ file ở bước B (mở trong terminal riêng tư, không dán vào chat) |
| Variable | `CF_STAGING_DB_HOSTS` | các mục `host:cổng` DB được phép, cách nhau dấu phẩy, ví dụ `127.0.0.1:5434` (không dùng ký tự đại diện) |
| Variable | `CF_STAGING_DB_NAME` | tên DB staging chính xác (`commentflow` theo script B) |

Và **Deployment branches = Selected branches → `main`** cho `staging-migrate` (workflow cũng chỉ chạy trên `main`). Kiểm (máy code): `gh api repos/<chủ>/<repo>/environments/staging-migrate --jq '.deployment_branch_policy'` in chính sách nhánh tùy chọn (`custom_branch_policies: true`).

### D3. Chạy deploy lần đầu

**Chỉ làm sau C (có tên miền + SMTP) và E.** Actions → **Deploy staging** → *Run workflow* → gõ `staging` → bạn nhận yêu cầu duyệt (environment `staging`) → **Approve**. Mong đợi: các bước xanh; bước cuối in `docker compose ps` với `web` và `worker` ở trạng thái `healthy`.

---

## E. Migration + hàng đợi lên staging

**Đã có (PR #39 `STAGING-MIGRATE`).** Không chạy `pnpm db:migrate` tay lên staging (CLI cũ từ chối `APP_ENV=staging`). Thay vào đó là CLI riêng, chỉ chạy trong workflow `.github/workflows/migrate-staging.yml` (trên `main`, environment `staging-migrate`, runner `cf-staging`):

| Lệnh | Việc |
|---|---|
| `pnpm db:migrate:staging --dry-run` | Chỉ đọc: liệt kê migration đang chờ (job `dry-run`) |
| `pnpm db:migrate:staging` | Áp migration thật (job `migrate`), kiểm trước/sau |
| `pnpm --filter @flow/worker queue:install:staging [--dry-run]` | Cài hàng đợi pg-boss: `ingest`, `send`, `hide`, `system.ping` |

Cấu hình cần có (D2/D2b): secret `STAGING_DATABASE_ADMIN_URL`; variable `CF_STAGING_DB_HOSTS` (`host:cổng`), `CF_STAGING_DB_NAME`; `DEPLOY_STAGING_ENABLED=true`. Biến xác nhận **`CF_CONFIRM_STAGING_MIGRATE`** = `<tên-db>@<số migration cuối>` (ví dụ `commentflow@0028`) — bạn nhập vào ô `confirm_migrate` khi chạy workflow; số cuối lấy từ kết quả dry-run (tiền tố của migration chờ cuối cùng). CLI so sánh chính xác, phân biệt hoa thường; production luôn bị từ chối.

### E1. Một lần: đánh dấu DB là staging (quyền Postgres cao nhất)

CLI từ chối DB không có dấu `cf.env = 'staging'`. DB phải tồn tại trước (Postgres của `cf-staging` tạo DB `commentflow` lần chạy đầu; khởi động riêng Postgres nếu cần: `docker compose -p cf-staging --env-file <file> -f infra/docker-compose.yml -f infra/docker-compose.staging.yml up -d --wait postgres`).

```bash
sudo -u gh-runner docker compose -p cf-staging exec postgres \
  psql -U postgres -d postgres -c "ALTER DATABASE commentflow SET cf.env = 'staging';"
```

Kiểm:

```bash
sudo -u gh-runner docker compose -p cf-staging exec postgres \
  psql -U postgres -d postgres -tAc "SELECT setconfig FROM pg_db_role_setting s JOIN pg_database d ON d.oid=s.setdatabase WHERE d.datname='commentflow';"
```

Mong đợi: in `{cf.env=staging}`. (Thay `commentflow` nếu bạn đổi `CF_DATABASES`.)

### E2. Chạy

1. Actions → **Migrate staging** → *Run workflow* trên nhánh `main` → `confirm` = `staging`, `confirm_migrate` = `<db>@<số cuối>`.
2. Duyệt job `dry-run` → đọc log: danh sách migration chờ và số cuối. Sai số xác nhận thì chạy lại với số đúng.
3. Duyệt job `migrate` (ghi thật).

Kiểm sau: cả hai job xanh; log báo đã áp migration và cài hàng đợi `ingest`, `send`, `hide`, `system.ping`. Chạy lại workflow → dry-run báo không còn migration chờ. Đường runner tới Postgres: xem "Đường runner → Postgres staging" ở đầu tài liệu (loopback `127.0.0.1:5434`; cần compose staging đã `up`). Không chạy `pnpm db:check-rls` hay lệnh ghi tay lên staging.

---

## F. Kiểm sau deploy

Sau mục C (kể cả SMTP), E xong và deploy xanh.

### F1. Health (trong mạng Compose, không qua internet)

```bash
sudo -u gh-runner docker compose -p cf-staging ps
sudo -u gh-runner docker compose -p cf-staging exec web wget -qO- http://localhost:3000/api/health
sudo -u gh-runner docker compose -p cf-staging exec worker wget -qO- http://localhost:3001/health
```

Mong đợi: `web` và `worker` đều `healthy`; hai lệnh `wget` in JSON báo ổn (HTTP 200). Nếu image không có `wget`, dùng `docker compose … ps` (cột `healthy` đã dựa trên đúng các endpoint này). Kiểm web **không publish cổng**: cột PORTS của `web` không có dạng `0.0.0.0:…->3000`.

### F2. Đăng nhập thử (trình duyệt)

1. Mở `https://staging.<tên-miền>` → trang đăng nhập hiện ra (HTTPS hợp lệ).
2. Đăng ký tài khoản thử bằng email thật của bạn → thư xác minh đến hộp thư (chứng tỏ SMTP đúng) → bấm link → đăng nhập → vào được `/app`.
3. Đăng xuất, đăng nhập lại: thành công.

Nếu không nhận thư: `sudo -u gh-runner docker compose -p cf-staging logs --tail 50 web | grep -i smtp` (log đã che email/PII; không dán nguyên log lên chỗ công khai).

### F3. Worker dọn payload webhook (`WEBHOOK-PAYLOAD-RETENTION`)

```bash
sudo -u gh-runner docker compose -p cf-staging logs worker | grep "đã dọn payload"
```

Mong đợi: có ít nhất một dòng `đã dọn payload webhook/dấu xóa quá hạn` (job chạy lúc khởi động rồi mỗi giờ). Không có dòng nào sau vài phút → báo máy code (tạo issue nhãn `staging-bug`, đã che PII).

---

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Cách xử |
|---|---|---|
| Job Deploy "Queued" mãi | Runner offline / nhãn sai | `sudo ./svc.sh status`; trên GitHub xem nhãn có `cf-staging` |
| Job bị bỏ qua (Skipped) | `DEPLOY_STAGING_ENABLED` chưa là `true`, hoặc workflow migrate không chạy từ `main` | Kiểm D2/D3 |
| `Thiếu biến STAGING_ENV_FILE` / `Không thấy file biến` | Sai đường dẫn hoặc `gh-runner` không đọc được | `sudo -u gh-runner test -r <đường dẫn> && echo OK` |
| `compose config` báo `required variable X is missing` | Biến X còn trống trong file | Điền X (mục B4); tên biến được báo, giá trị không |
| `permission denied … docker.sock` | `gh-runner` chưa ở nhóm `docker` hoặc service chưa khởi động lại | `sudo usermod -aG docker gh-runner` rồi `sudo ./svc.sh stop && sudo ./svc.sh start` |

Liên quan: `docs/staging/H5-CHECKLIST.md` (checklist kỹ thuật), `docs/CAN_BAN_CUNG_CAP.md` (khóa/tài khoản bạn cần cung cấp), `.github/workflows/migrate-staging.yml`, `docs/plans/feat-staging-migrate.md`, `docs/15_Deployment_Architecture.md` §2, §5.
