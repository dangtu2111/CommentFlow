# Hướng dẫn dựng staging — từng bước cho chủ dự án

> **Phải merge SAU PR #37** (`chore/h5-staging-prep`): tài liệu này tham chiếu `infra/docker-compose.staging.yml`, `infra/env.cf-staging.example`, `.github/workflows/deploy-staging.yml`, `docs/staging/H5-CHECKLIST.md` — các file đó chỉ có sau khi #37 vào `main`.

**Tóm tắt.** "Staging" là bản chạy thử của CommentFlow trên máy ảo Ubuntu (project Docker Compose `cf-staging`), ra internet qua Cloudflare Tunnel, để thử với Page Facebook thật trước khi lên production. Tài liệu này dẫn bạn làm theo thứ tự: cài "người làm việc" của GitHub trên máy ảo (runner), sinh file bí mật ngay trên máy ảo, nối tên miền Cloudflare, bật các công tắc trên GitHub, rồi kiểm tra sau khi deploy. **Rủi ro chính:** (1) mất `TOKEN_ENC_KEYS` = mọi kênh phải kết nối lại; (2) runner tự host chạy lệnh trên máy ảo của bạn nên phải cài đúng cách (dưới đây).

Mọi lệnh gõ **trên máy ảo** (qua `ssh cf`) trừ khi ghi rõ "trên GitHub", "trên Cloudflare" hoặc "máy code". **Không dán bí mật vào chat, issue, log hay commit.** Máy code (Windows) không dùng Docker.

## Việc bạn cần làm

| # | Việc | Ở đâu | Trạng thái |
|---|---|---|---|
| A | Cài runner GitHub tự host, chạy như service, user riêng không root | Máy ảo + GitHub | Làm được ngay |
| B | Sinh file `.env.cf-staging` bằng script `infra/scripts/gen-staging-env.sh` | Máy ảo | Làm được ngay |
| C | Tên miền + Cloudflare Tunnel + token | Cloudflare | Cần tên miền (đang hoãn) |
| D | Biến GitHub (`DEPLOY_STAGING_ENABLED`, `STAGING_ENV_FILE`) + environment `staging`, `staging-migrate` | GitHub | Làm được ngay (nhưng chỉ bật `DEPLOY_STAGING_ENABLED` ở cuối) |
| E | Migration + cài hàng đợi lên staging | GitHub Actions | **Sắp có** (CLI `staging-migrate` chưa tồn tại) |
| F | Kiểm sau deploy: health, đăng nhập thử, worker dọn payload | Máy ảo + trình duyệt | Sau khi A–E xong |

Thứ tự khuyến nghị: A → B → D (trừ công tắc bật) → E → deploy lần đầu → C → F.

## Cần bạn quyết định

1. **Tên miền staging** (ví dụ `staging.<tên-miền-của-bạn>`): chưa có thì dừng ở trước mục C; deploy vẫn chạy được nhưng chưa vào được từ internet.
2. **Repo có công khai không?** Runner tự host trên repo **công khai** là nguy hiểm (người lạ gửi PR có thể chạy mã trên máy ảo). Khuyến nghị: repo **private**. Nếu công khai, đặt Settings → Actions → General → "Fork pull request workflows" = *Require approval for all outside collaborators* và không dùng runner này.
3. **SMTP thật** dùng cho thư (staging không có Mailpit): chọn nhà cung cấp (ví dụ Brevo, Amazon SES, Gmail App Password) để điền `SMTP_*`.
4. **Mã người duyệt** của hai environment: mặc định là chính bạn (Required reviewers). Có thêm người nào không?
5. **Khóa `TOKEN_ENC_KEYS` của staging** nằm trong file trên máy ảo (do script sinh). Bạn có đồng ý sao lưu riêng nó vào trình quản lý mật khẩu (bắt buộc, `docs/CAN_BAN_CUNG_CAP.md` §1.3 mục 3) không? Lưu ý: §1.3 mục 2 cấm đặt khóa **dev** trên máy ảo; khóa **staging** là khóa riêng, được phép nằm trên máy ảo (§1.3 mục 5).

---

## A. Cài runner GitHub tự host

**Mục đích:** để workflow `Deploy staging` chạy lệnh `docker compose` ngay trên máy ảo. Workflow chọn runner theo nhãn `self-hosted, linux, cf-staging`.

**Nguyên tắc an toàn:** user riêng `gh-runner` (không root, không `sudo`), chạy như service, chỉ dùng cho hai environment `staging` / `staging-migrate`. Lưu ý trung thực: user trong nhóm `docker` gần như có quyền root trên máy (có thể chạy container gắn ổ đĩa). Vì vậy runner chỉ được dùng bởi workflow bạn kiểm soát, repo nên private (quyết định 2), và máy ảo này không chứa gì ngoài dev/staging.

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
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS` | Nhà cung cấp SMTP (quyết định 3). `SMTP_SECURE=true` nếu cổng 465 |
| `META_APP_ID`, `META_APP_SECRET` | Meta App dev riêng cho staging (`docs/CAN_BAN_CUNG_CAP.md` §1) — có thể để trống đến khi thử Facebook thật |
| `CLOUDFLARE_TUNNEL_TOKEN` | Mục C |
| `BETTER_AUTH_URL`, `LANGFUSE_INIT_USER_EMAIL` | Nếu lúc chạy script chưa có `--domain` / `--email` |

`META_WEBHOOK_VERIFY_TOKEN` đã được sinh sẵn — dán **cùng giá trị** vào ô "Verify token" ở Meta khi đăng ký webhook (xem bằng `sudo -u gh-runner grep META_WEBHOOK_VERIFY_TOKEN …` trong terminal riêng tư). `IMAGE_TAG` để trống (workflow tự đặt). `CLIENT_IP_SOURCE` để `none` cho đến khi tunnel chạy (mục C6).

Phần `SMTP_*` bắt buộc phải điền (compose báo lỗi nếu trống). Kiểm bằng cách dựng thử cấu hình (không chạy gì):

```bash
cd ~/CommentFlow && sudo -u gh-runner docker compose --env-file /home/gh-runner/cf-staging/.env.cf-staging \
  -f infra/docker-compose.yml -f infra/docker-compose.staging.yml config --quiet && echo "compose config OK"
```

(Lệnh này đọc `infra/*.yml` trong clone của bạn — nếu `gh-runner` không đọc được thư mục clone, bỏ qua; workflow ở GitHub sẽ chạy đúng bước kiểm này.) Mong đợi: `compose config OK`; nếu thiếu biến sẽ báo đúng tên biến (không in giá trị).

### B5. Sao lưu `TOKEN_ENC_KEYS`

Mở file, copy **riêng** dòng `TOKEN_ENC_KEYS=…` vào trình quản lý mật khẩu (tách khỏi nơi sao lưu DB). Xoay khóa sau này: thêm `,v2:<hex mới>` phía sau, không xóa `v1` cho tới khi mọi kênh đã mã hóa lại (`docs/CAN_BAN_CUNG_CAP.md` §1.3 mục 4).

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

### Kiểm tra C

```bash
sudo -u gh-runner docker compose -p cf-staging ps cloudflared
sudo -u gh-runner docker compose -p cf-staging logs --tail 20 cloudflared | grep -i "registered tunnel connection"
curl -sS -o /dev/null -w "%{http_code}\n" https://staging.<tên-miền>/api/health
```

Mong đợi: `cloudflared` trạng thái `running`; log có dòng `Registered tunnel connection`; `curl` in `200`. Trên Zero Trust → Tunnels, `cf-staging` hiện **Healthy**.

---

## D. Biến và environment trên GitHub

Làm trên GitHub, repo → **Settings**.

### D1. Hai environment (Settings → Environments → New environment)

| Tên | Dùng cho | Required reviewers |
|---|---|---|
| `staging` | Job deploy (`deploy-staging.yml`) | **Bạn** (chủ dự án) |
| `staging-migrate` | Job migration + cài hàng đợi (mục E, sắp có) | **Bạn** |

Cho mỗi environment: bật **Required reviewers** → thêm chính bạn (và người ở quyết định 4); để **Prevent self-review** TẮT nếu bạn là người duy nhất (bật lên thì bạn không tự duyệt được lần chạy do chính mình kích hoạt). Để **Deployment branches** = *Selected branches* → `main`. Không đặt secret nào trong environment — mọi bí mật nằm trên máy ảo.

Kiểm: trang Environments liệt kê `staging` và `staging-migrate`, mỗi cái ghi "Required reviewers". (Trên máy code: `gh api repos/<chủ>/<repo>/environments --jq '.environments[].name'` → in hai tên.)

### D2. Biến repo (Settings → Secrets and variables → Actions → tab **Variables** → New repository variable)

| Tên | Giá trị | Ghi chú |
|---|---|---|
| `STAGING_ENV_FILE` | `/home/gh-runner/cf-staging/.env.cf-staging` | Đường dẫn file trên máy ảo (không phải bí mật) |
| `DEPLOY_STAGING_ENABLED` | `true` | **Tạo cuối cùng**, khi A, B (và E) đã xong. Xóa biến hoặc đổi khác `true` = tắt deploy |

Kiểm (máy code): `gh variable list` → thấy hai biến. Với `DEPLOY_STAGING_ENABLED` chưa tạo, workflow bị bỏ qua (an toàn).

### D3. Chạy deploy lần đầu

Actions → **Deploy staging** → *Run workflow* → gõ `staging` → bạn nhận yêu cầu duyệt (environment `staging`) → **Approve**. Mong đợi: các bước xanh; bước cuối in `docker compose ps` với `web` và `worker` ở trạng thái `healthy`.

---

## E. Migration lên staging — SẮP CÓ (chưa dùng được)

**Hiện trạng:** CLI migration hiện **từ chối** `APP_ENV=staging` (`migration-guard`, AGENTS.md: "staging/production chỉ qua CI có duyệt"). Vì vậy bây giờ **không** chạy `pnpm db:migrate` hay `queue:install` lên staging bằng tay.

**Sắp làm (nhánh sau, có verifier):** một CLI riêng, tạm gọi **`staging-migrate`**, chỉ chạy trong job dùng environment `staging-migrate` (có Required reviewers), yêu cầu **biến xác nhận** (ví dụ `CONFIRM_STAGING_MIGRATE=<tên DB>`; tên chính xác chốt khi viết) và chạy: `db:migrate` → `db:check-rls` → `queue:install` (tạo hàng đợi `ingest`, `send`, `hide`, `system.ping`). Tên/biến chỉ là dự kiến — mục này được cập nhật khi CLI có.

Cho tới khi có: staging chưa thể lên đủ (DB chưa có bảng), nên **chưa bật `DEPLOY_STAGING_ENABLED`** nếu bạn muốn một lần deploy thành công trọn vẹn. Đây cũng là điều kiện trước khi làm mục F.

---

## F. Kiểm sau deploy

Sau mục E xong và deploy xanh.

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
| Job bị bỏ qua (Skipped) | `DEPLOY_STAGING_ENABLED` chưa là `true` hoặc không gõ đúng `staging` | Kiểm D2/D3 |
| `Thiếu biến STAGING_ENV_FILE` / `Không thấy file biến` | Sai đường dẫn hoặc `gh-runner` không đọc được | `sudo -u gh-runner test -r <đường dẫn> && echo OK` |
| `compose config` báo `required variable X is missing` | Biến X còn trống trong file | Điền X (mục B4); tên biến được báo, giá trị không |
| `permission denied … docker.sock` | `gh-runner` chưa ở nhóm `docker` hoặc service chưa khởi động lại | `sudo usermod -aG docker gh-runner` rồi `sudo ./svc.sh stop && sudo ./svc.sh start` |

Liên quan: `docs/staging/H5-CHECKLIST.md` (checklist kỹ thuật), `docs/CAN_BAN_CUNG_CAP.md` (khóa/tài khoản bạn cần cung cấp), `docs/15_Deployment_Architecture.md` §2, §5.
