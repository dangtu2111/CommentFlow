# Kế hoạch dựng khung (chore-scaffold) — bản 2 (02/11/2026)

Trạng thái: **ĐÃ DUYỆT 02/11/2026** (kèm điều chỉnh ở mục "Quyết định đã chốt" cuối file). Làm trên nhánh `chore/scaffold`. Căn cứ: `000`, `001-stack.md` (bản 2), `002-hai-may.md`, `09` §2–3.1 và §10, `10` §1/§3.1/§3.7/§3.8/§4, `13` §4, `15` §4, `16` §3–3.1, `08` §8.

## Tóm tắt (đọc phần này trước)

Dựng "bộ xương" của hệ thống trên **một nhánh `chore/scaffold`** (mỗi bước một commit nhỏ, xong thì merge vào `main`). Máy code **không có Docker**: Next.js, worker, test chạy bằng Node trên máy code; mọi container chạy trên máy ảo Ubuntu qua hai Compose project — `cf-dev` (cho máy code dùng qua LAN) và `cf-staging` (đủ 7 dịch vụ). Rủi ro chính: (1) MinIO đã bị hãng ngừng (kho mã đã lưu trữ, image Docker Hub không còn) → đổi sang **SeaweedFS** theo đúng điều kiện bạn đặt; (2) Better Auth lệch spec ở chỗ lưu token phiên (xem Rủi ro); (3) RLS + đăng nhập là phần nhạy cảm → kiểm chứng độc lập một lần cuối nhánh.

## Thay đổi so với bản 1

| Mục | Bản 1 | Bản 2 |
|---|---|---|
| Nhánh | 3 nhánh A/B/C | 1 nhánh `chore/scaffold`, nhiều commit |
| Docker | Docker Desktop trên máy code, WSL2 | **Không Docker trên máy code**; container ở máy ảo `cf` |
| Compose | 1 bộ, profile `infra`/`obs`/`app` | 2 project: `cf-dev`, `cf-staging` |
| Redis | Redis 7.2 | **Valkey 8.1** |
| S3 | MinIO | **SeaweedFS** (MinIO đã ngừng) |
| Auth | Tự viết mỏng | **Better Auth** (chỉ đăng ký/đăng nhập/phiên) |
| Test DB | Postgres của Compose trên máy code | `TEST_DATABASE_URL` → DB `cf_test` trên máy ảo, tạo lại schema mỗi lần; CI dùng service container |
| Chặn migration nhầm | "chỉ chạy với host local" | Danh sách cho phép: chỉ DB `cf_dev`/`cf_test`/`cf_ci`; staging/production chỉ qua CI |
| Chuỗi giao diện viết cứng | Chưa có | Kiểm riêng (bước S7) vì Biome không bắt được |

## Kiến trúc chạy (theo `002`)

| Chạy ở đâu | Gì |
|---|---|
| Máy code (Node 22.15, pnpm 10) | `apps/web` (dev server), `apps/worker`, unit test, integration test, lint, typecheck |
| Máy ảo, project `cf-dev` | Postgres+pgvector (DB `cf_dev`, `cf_test`, `litellm`, `langfuse`), Valkey, `ml`, LiteLLM, Langfuse web/worker, ClickHouse, SeaweedFS |
| Máy ảo, project `cf-staging` | Đủ 7 dịch vụ (thêm `web`, `worker`); **Postgres/Valkey không publish cổng**; ra internet qua Cloudflare Tunnel (làm ở GĐ3) |

`.env` máy code (sinh bởi `scripts/env-init.mjs`, không commit) chứa: `DATABASE_URL`, `TEST_DATABASE_URL`, `REDIS_URL`, `ML_URL`, `LITELLM_BASE_URL`, `LANGFUSE_HOST` trỏ tới `192.168.1.124` (IP LAN của máy phụ, qua portproxy). Mã nguồn **không giả định có Docker**: mọi script dev gọi Node; riêng `scripts/cf-dev.mjs` chạy `ssh cf "cd ~/CommentFlow && docker compose -p cf-dev …"`, **cứng chỉ cho project `cf-dev`** (từ chối tên project khác).

### Cổng `cf-dev` cần publish (để bạn thêm portproxy + luật tường lửa chỉ cho `192.168.1.96`)

| Cổng | Dịch vụ | Dùng để | Ghi chú |
|---|---|---|---|
| 5433 | Postgres | `DATABASE_URL`, `TEST_DATABASE_URL` | cổng khác 5432 để không nhầm với staging |
| 6380 | Valkey | `REDIS_URL` | dev dùng prefix khóa `dev:` |
| 8001 | `ml` | `ML_URL` | |
| 4000 | LiteLLM | `LITELLM_BASE_URL` | |
| 3100 | Langfuse web | `LANGFUSE_HOST` | giao diện + API ghi trace |

Tổng **5 cổng** → 5 dòng `netsh interface portproxy` + 5 luật tường lửa. Không publish: ClickHouse, Langfuse worker, SeaweedFS (chỉ dùng nội bộ; hệ quả: tính năng tải media đa phương thức của Langfuse từ máy code không dùng được — không cần ở GĐ0–2). Lưu ý: qua portproxy, máy ảo thấy mọi kết nối đến từ `10.10.10.1`, nên `ufw` trên máy ảo **không** phân biệt được `192.168.1.96`; chặn theo IP phải đặt ở tường lửa Windows của máy phụ như `002` đã ghi.

## Cấu trúc sẽ tạo (theo `09` §3)

| Đường dẫn | Giải thích |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.nvmrc`, `.gitattributes`, `.editorconfig`, `.gitignore` | Cấu hình gốc (LF thống nhất) |
| `apps/web/` | Next.js 16 + next-intl (cookie), trang chủ + chọn ngôn ngữ + `/api/health` |
| `apps/worker/` | Node + pino + máy chủ `/health` (cổng 3001); pg-boss nối ở bước C |
| `services/ml/` | FastAPI chỉ `/health` |
| `packages/shared/` | `AppError`, helper đọc env bằng Zod, `vi.json`/`en.json` + test khớp khóa |
| `packages/db/` | Drizzle schema, migration SQL, RLS, `withWorkspace()`, script `check-rls`, `db:test:reset` |
| `packages/saas-core/` | `auth` (Better Auth), `tenancy`, `flags` |
| `packages/ai/` | `callLlm()` → LiteLLM + ghi `ai_usage` |
| `infra/` | `docker-compose.yml` (nền, không publish cổng) + `docker-compose.dev.yml` (cf-dev) + `docker-compose.staging.yml` (cf-staging), Dockerfile, cấu hình LiteLLM, script khởi tạo Postgres |
| `scripts/` | `cf-dev-env-init.sh` (chạy **trên máy ảo**, sinh `.env.cf-dev` bằng openssl, chmod 600, không in bí mật), `cf-dev.mjs` (ssh cf, chỉ project cf-dev, từ chối `-v`/`-p`/`-f`/staging, `config` chỉ với `-q`), `stack-check.mjs` (từ máy code, không cần mật khẩu) |
| `env.example`, `infra/env.cf-dev.example` | Tên biến + mô tả cho `.env` (máy code) và `.env.cf-dev` (máy ảo). Không có dấu chấm đầu vì quy tắc quyền chặn ghi `.env*.example` — đổi tên bằng `git mv` nếu muốn |
| `.github/workflows/ci.yml`, `.gitleaks.toml`, `.dependency-cruiser.cjs` | CI và luật ranh giới |

Không tạo ở khung này: `packages/connectors`, `evals/`, design tokens (`08` §2), Caddy, trang đăng nhập/đăng ký, deploy staging (workflow runner — GĐ3).

## File sẽ đọc / file sẽ sửa

- **Đọc:** chỉ các mục spec ở dòng "Căn cứ" (đã đọc). Khi code không đọc thêm tài liệu nào.
- **Sửa ngoài file mới:** `AGENTS.md` mục "Lệnh"; `docs/codemap.md` (`/codemap-init` một lần cuối); `docs/gap-matrix.md`.

## Các bước (mỗi bước một commit, có cách kiểm tra)

### Giai đoạn 1 — Khung repo (chạy hoàn toàn trên máy code)

| # | Việc | Cách kiểm tra |
|---|---|---|
| S1 | **Điều kiện đầu: `node -v` phải là 24.x, nếu không thì DỪNG và báo chủ dự án.** Monorepo pnpm, TypeScript **6.0.3**, `strict`, Biome, `.gitattributes` LF, `.nvmrc` = 24, `engines.node` = `>=24 <25` | `pnpm install`, `pnpm lint`, `pnpm typecheck` xanh |
| S2 | `packages/shared` (viết test trước) | `pnpm --filter @flow/shared test` xanh; xóa một khóa ở `en.json` → test đỏ |
| S3 | `apps/web`: Next + next-intl, ngôn ngữ lưu cookie, `/api/health` | `pnpm --filter web build` xanh; `pnpm --filter web dev` → trang vi/en đổi được; `/api/health` 200 |
| S4 | `apps/worker`: cấu hình Zod, pino che bí mật/PII, `/health` | Chạy worker, `curl localhost:3001/health` ok; log không lộ giá trị bí mật |
| S5 | `services/ml`: FastAPI `/health`, uv, pytest, ruff | Chạy ở CI (máy code không có uv/Python 3.12) và trên máy ảo khi dựng image |
| S6 | `dependency-cruiser` + test của chính luật (saas-core không import `ai`/`connectors`/`apps`/`db/schema/cf`; `packages/*` không import `apps/*`; `shared` là lá; không vòng) | `pnpm depcruise` xanh; thêm tạm import cấm → đỏ |
| S7 | Kiểm **chuỗi giao diện viết cứng** (`14` §2, FR-119) cho `apps/web` — chi tiết ở mục "Biome không bắt được" | Thêm tạm `<p>Xin chào</p>` → đỏ; dùng `t('…')` → xanh |
| S8 | CI GitHub Actions: node (lint, typecheck, test, depcruise, i18n), python, gitleaks | Đẩy nhánh → xanh; commit khóa giả trên nhánh tạm → gitleaks đỏ |

### Giai đoạn 2 — Hạ tầng trên máy ảo (chỉ `cf-dev`)

| # | Việc | Cách kiểm tra |
|---|---|---|
| H1 | Compose nền + `cf-dev`: Postgres (DB `cf_dev`, `cf_test`, `litellm`, `langfuse`; role `cf_owner` migration, `cf_app` không `BYPASSRLS`; extension `vector`, `unaccent`, `pg_trgm`, `citext`) + Valkey (`--requirepass`, `maxmemory-policy noeviction`); `.env.example`; `env-init.mjs` | `pnpm cf:up postgres valkey` → healthy; từ máy code kết nối được qua `DATABASE_URL`; 4 extension có mặt; `rolbypassrls` của `cf_app` = false |
| H2 | LiteLLM + model giả `mock-llm`, cache Valkey, DB riêng | `curl $LITELLM_BASE_URL/health/liveliness` ok; gọi `mock-llm` có trả lời |
| H3 | ClickHouse + SeaweedFS (S3, bắt buộc file danh tính) + Langfuse web/worker, khởi tạo bằng `LANGFUSE_INIT_*`; LiteLLM gửi trace | Bốn container healthy; gọi `mock-llm` xong, API Langfuse (khóa dự án dev) thấy trace; ghi RAM bằng `docker stats` |
| H4 | `ml` image + `scripts/cf-dev.mjs` (up/down/ps/logs, chỉ `cf-dev`) + `stack-check.mjs` (từ máy code gọi mọi URL trong `.env`) | `pnpm stack:check` xanh toàn bộ; Valkey đúng prefix `dev:` |
| H5 | `docker-compose.staging.yml` + Dockerfile web/worker/ml (nhiều tầng, user thường). **Không chạy**, chỉ kiểm cú pháp: `ssh cf "cd ~/CommentFlow && docker compose -p cf-dev -f … -f docker-compose.staging.yml config -q"` | Lệnh `config -q` thoát 0; xác nhận Postgres/Valkey của staging không có `ports:` |

> **Trạng thái nhóm H (03/11/2026):** H1–H4 xong và kiểm từ máy code (`pnpm stack:check` 7/7). H5 (compose staging, Dockerfile web/worker, runner, Cloudflare Tunnel) **HOÃN đến khi có tên miền** (chủ dự án chốt 03/11). Số đo RAM thật ở `001-stack.md` §8.

### Giai đoạn 3 — Lõi dùng chung (cần `cf-dev`; chỉ khung hạ tầng, không nghiệp vụ sản phẩm)

| # | Việc | Cách kiểm tra |
|---|---|---|
| C0 | **Khảo sát ngắn Better Auth (không tạo code lâu dài):** nó lưu token phiên thô hay băm? có ánh xạ được vào `core.users`/`core.sessions` và multi-schema Drizzle không? Kết quả ghi vào `001-stack.md` | Ghi kết luận; nếu lệch spec → dừng, đề xuất (xem Rủi ro) |
| C1 | `packages/db`: Drizzle schema + migration SQL. `core`: `users`, `sessions`, `workspaces`, `members`, `invitations`, `feature_flags`, `feature_flag_overrides`, `action_logs` (cột theo `10` §3.7: workspace_id, actor_type, actor_id, action, target_type, target_id, before, after, impersonation_id, ip). `cf`: `ai_usage`. Policy RLS. `db:migrate` chỉ chạy với `APP_ENV` ∈ {dev,test,ci} **và** tên DB ∈ {`cf_dev`,`cf_test`,`cf_ci`}; `db:test:reset` xóa-tạo lại schema `cf_test` | Migrate trên DB trống xanh, chạy lại không đổi; trỏ vào DB tên khác → bị từ chối |
| C2 | `withWorkspace(ws, fn)`, `withSystem(fn)` — **test trước**, test chạy với `TEST_DATABASE_URL` | Ngoài `withWorkspace` → 0 dòng; dùng lại kết nối không rò sang workspace khác |
| C3 | Test RLS chéo workspace + `check-rls` (mỗi bảng có `workspace_id` phải có RLS + policy; `cf_app` không là chủ bảng, không `BYPASSRLS`) | A đọc/sửa/chèn bằng id của B → bị chặn; xóa thử policy → `check-rls` đỏ |
| C4 | `saas-core/tenancy`: tạo workspace (người tạo = `owner`), thêm thành viên, liệt kê workspace của một người dùng | Test xanh, gồm "Staff không thấy workspace khác" |
| C5 | `saas-core/auth` bằng **Better Auth**: chỉ đăng ký, đăng nhập, quản lý phiên (email + mật khẩu); workspace/thành viên/lời mời vẫn là bảng của saas-core, **không** dùng plugin organization | Test: sai mật khẩu bị từ chối; phiên hết hạn bị loại; kết luận C0 được áp dụng |
| C6 | `saas-core/flags`: `isEnabled` đúng thứ tự `09` §10, cache 30 giây, `NOTIFY flags_changed`, lỗi đọc → `default_on` | Mỗi tầng một test; ca lỗi đọc có test |
| C7 | `packages/ai`: `callLlm()` (fetch + Zod) → LiteLLM, ghi `ai_usage`, lỗi `LLM_UNAVAILABLE` | Test tích hợp với `mock-llm`: đúng 1 dòng `ai_usage` + trace Langfuse; tắt LiteLLM → lỗi có mã, log không chứa prompt |
| C8 | pg-boss: schema tạo bằng `cf_owner` ở bước migrate; `runJob()` đặt workspace từ dữ liệu job; job mẫu `system.ping` | Job vào hàng đợi → xử lý đúng một lần; job thiếu `workspaceId` chỉ chạy được bằng `withSystem` |
| C9 | CI: service container Postgres (`pgvector/pgvector:0.8.7-pg16`) + Valkey, đặt `TEST_DATABASE_URL`, chạy migrate + `check-rls` + test tích hợp | CI xanh |
| C10 | `/codemap-init`; cập nhật `gap-matrix.md`; `docs/handoff/chore-scaffold.md`; **một lần** `verifier-db` + `verifier-security`; merge `chore/scaffold` → `main` | Hai báo cáo không còn lỗi cao; `/finish` xanh |

## Biome không bắt được chuỗi viết cứng — đề xuất

Biome không có luật "cấm chuỗi chữ trong JSX". **Đã chốt cách 1** (cách 2 giữ lại làm tham khảo):

1. **ESLint chỉ cho đúng một luật:** `eslint` + `eslint-plugin-i18next` (luật `no-literal-string`, chế độ chỉ xét văn bản JSX và thuộc tính hiển thị) + trình phân tích TypeScript, áp cho `apps/web`; chạy bằng `pnpm lint:i18n`, một job CI riêng. Thêm 3 gói dev (MIT), luật do cộng đồng bảo trì, xử lý sẵn nhiều ca biên. Biome vẫn lo toàn bộ lint/format còn lại.
2. **Script riêng** `scripts/check-i18n-literals.mjs` dùng API của `typescript` (đã có sẵn, không thêm gói): quét `JSXText` khác rỗng và chuỗi trong thuộc tính `title`/`placeholder`/`alt`/`aria-label`, có danh sách ngoại lệ. Không thêm phụ thuộc nhưng chúng ta tự bảo trì và tự viết test cho ca biên.

Cả hai cách đều giữ test khớp khóa `vi.json`/`en.json` (S2). Email/thông báo ở worker sẽ cần kiểm tương tự khi có.

## Cổng nghiệm thu của khung

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm depcruise && pnpm lint:i18n` xanh trên máy code; `pnpm --filter web build` xanh.
2. `pnpm stack:check` xanh (cf-dev); `check-rls` xanh; test tích hợp xanh trên `cf_test`.
3. `callLlm()` với `mock-llm` tạo 1 dòng `ai_usage` **và** 1 trace Langfuse.
4. CI xanh (service container).
5. Compose staging qua `config -q`; RAM thực đo được ghi vào `001-stack.md`.

## Việc tiếp theo (không thuộc kế hoạch này)

Quên mật khẩu · 2FA TOTP + mã dự phòng · giới hạn đăng nhập sai · lời mời · giao diện đăng ký/đăng nhập/chuyển workspace (vi/en) · design tokens (`08` §2) · `/stitch-sync` · deploy `cf-staging` bằng self-hosted runner + Cloudflare Tunnel (GĐ3) · Business Verification Meta.

## Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| **Better Auth vs spec `10` §3.1:** spec yêu cầu `sessions.token_hash` (DB chỉ lưu băm), `is_admin_session`, 2FA bắt buộc cho Owner/Admin, impersonation. Tôi chưa xác minh được Better Auth lưu token phiên thô hay băm và có ánh xạ được vào schema `core` | Bước **C0** khảo sát trước khi viết auth. Nếu lệch: (a) dùng `secondaryStorage`/hook của Better Auth để băm; hoặc (b) đề xuất bằng lời sửa `10` §3.1 (chờ bạn duyệt — tôi không tự sửa `docs/01–16`) |
| MinIO ngừng (kho mã lưu trữ 02/2026, image Docker Hub không còn) | Dùng **SeaweedFS** (Langfuse liệt kê hỗ trợ chính thức, Apache-2.0). Bắt buộc truyền file danh tính, nếu không S3 không xác thực. Không dùng bản `cgr.dev/chainguard/minio` hay `pgsty/minio` (dựng lại từ kho đã lưu trữ, bên thứ ba) |
| RLS chặn "danh sách workspace của tôi" trước khi chọn workspace | Policy `members` thêm điều kiện `user_id = app.user_id`; `verifier-db` xem kỹ |
| Khóa Redis phải chứa `workspace_id` nhưng đăng nhập diễn ra trước | Ngoại lệ có tên: tiền tố `sys:` (giới hạn đăng nhập) |
| Máy phụ tắt | Unit test/lint/typecheck/build vẫn chạy; việc cần DB chờ (`002`) |
| Máy code không có `uv`/Python 3.12 | Kiểm `ml` ở CI và trên máy ảo; ghi rõ "chưa chạy cục bộ" |
| `ssh cf` chưa chạy được từ phiên này (`Could not resolve hostname cf`) | Xem "Cần bạn quyết định" mục 5 |
| TypeScript 7.x (trình biên dịch viết lại) chưa kiểm với Next/Drizzle/Vitest | Chốt **6.0.3** từ đầu; không thử 7.x trong scaffold |
| Phiên bản thay đổi theo ngày | Ghim đúng số đã xác minh ngày 02/11/2026 (bảng ở `001-stack.md`) |

## Quyết định đã chốt (02/11/2026)

1. Kiểm chuỗi viết cứng: **cách 1** — ESLint chỉ luật `eslint-plugin-i18next` cho `apps/web`; Biome lo phần còn lại.
2. **SeaweedFS** thay MinIO; kiểm thật ở H3, nếu lỗi thì **báo, không tự đổi**.
3. Portproxy + tường lửa Windows cho 5433, 6380, 8001, 4000, 3100 (chỉ `192.168.1.96`) **đã được thêm**.
4. Compose staging chỉ kiểm bằng `docker compose -p cf-dev … config -q`; **không** `up` `cf-staging`.
5. `ssh cf` đã chạy được (đã xác nhận `echo ok`); chỉ dùng cho `cf-dev`.
6. Được đẩy riêng nhánh `chore/scaffold` (không đẩy `main`) để máy ảo `git pull`.
7. TypeScript **6.0.3** ngay từ đầu. Node **24 LTS** thống nhất máy code, máy ảo, Docker, CI; máy code chưa có Node 24 thì **dừng ở S1 và báo**.
8. C0 (Better Auth và `sessions.token_hash`): khảo sát trước; nếu lệch spec thì đề xuất bằng lời, chờ duyệt.
9. Báo cáo: sau mỗi bước chạy kiểm tra của bước đó; xong mỗi nhóm (S, H, C) báo ≤ 8 dòng.

## Đề xuất thay đổi — kết quả C0 (Better Auth vs `10` §3.1) — CHỜ CHỦ DỰ ÁN DUYỆT

Trạng thái: **đã khảo sát, chưa viết code auth.** Bằng chứng đọc từ mã nguồn `better-auth@1.7.15` (tải về thư mục tạm, chỉ đọc) và tài liệu chính thức.

| # | Spec (`10` §3.1) | Better Auth thực tế | Mức lệch |
|---|---|---|---|
| 1 | `sessions.token_hash` (DB chỉ lưu băm) | Token phiên sinh bằng `generateId(32)` và lưu **thô** ở `session.token`; tra cứu `WHERE token = …` (`dist/db/internal-adapter.mjs:285,355-362`). Không có tuỳ chọn băm token phiên (chỉ `verification.storeIdentifier` cho bảng `verification`). Cookie = token + **chữ ký HMAC** bằng `BETTER_AUTH_SECRET`, kiểm chữ ký trước khi tra DB (`dist/cookies/index.mjs:174`) | **Lệch** |
| 2 | `users.password_hash` | Mật khẩu ở bảng `account` (`providerId: "credential"`, cột `password`) (`dist/api/routes/sign-up.mjs:237-239`); email được hạ chữ thường | Lệch cấu trúc (cần thêm bảng) |
| 3 | `users.totp_secret_enc`, `totp_enabled` | Plugin 2FA dùng bảng `twoFactor` + `user.twoFactorEnabled`; mã dự phòng có tuỳ chọn `storeBackupCodes: "plain" \| "encrypted" \| {…}` | Lệch (để nhánh 2FA) |
| 4 | `admin_impersonations` (30 phút, `read_only`, lý do) | Plugin admin tạo **phiên thật** của người dùng, mặc định 1 giờ, không có read-only | Không dùng plugin admin; tự làm sau |
| 5 | 2FA bắt buộc cho Owner/Admin | Không có cơ chế bắt buộc theo vai trò | Tự thêm hook ở nhánh 2FA |
| 6 | `sessions.last_seen_at` | Chỉ có `updatedAt`, cập nhật theo chu kỳ `updateAge` | Gần đúng (đặt `updateAge` ngắn) |
| 7 | `id uuid default gen_random_uuid()`, schema `core`, tên bảng `users`/`sessions` | Khớp được: `advanced.database.generateId: false` (để DB sinh) hoặc `"uuid"`; `modelName`/`fields` đổi tên bảng/cột; `additionalFields` cho `locale`, `is_admin_session`…; Drizzle adapter nhận đối tượng schema Drizzle nên `pgSchema('core')` đi theo Drizzle | Khớp (cần xác nhận bằng test thật ở C5) |

**Hệ quả an toàn của #1:** nếu lộ **riêng** bảng `sessions`, kẻ tấn công **không** dựng được cookie hợp lệ vì thiếu khóa ký `BETTER_AUTH_SECRET` (chỉ nằm trong biến môi trường). Mất lợi ích "băm" chỉ khi lộ **cả** DB lẫn khóa ký.

### Phương án

| | Mô tả | Ưu | Nhược |
|---|---|---|---|
| **A (khuyến nghị)** | Giữ Better Auth, lưu token thô; bù bằng: cookie ký HMAC, `BETTER_AUTH_SECRET` chỉ ở env, **tắt `cookieCache`** (thu hồi phiên có hiệu lực ngay), `updateAge` ngắn, xoá phiên khi đăng xuất/đổi mật khẩu (`revokeOtherSessions`), không bao giờ log token, quyền SELECT bảng `sessions` chỉ cho role ứng dụng | Ít mã nhất, đúng quyết định #1 | Phải sửa spec `10` §3.1 (xem dưới) |
| B | Bọc adapter để băm token trước khi ghi/tra | Đúng chữ spec | Cookie cần token thô nhưng DB chỉ giữ băm → phải giữ token thô tạm ở nơi khác; mã phức tạp, dễ vỡ khi nâng cấp |
| C | Đổi quyết định #1: tự viết auth mỏng | Đúng spec, kiểm soát hoàn toàn | Nhiều mã bảo mật tự viết/bảo trì |
| D | Better Auth + `secondaryStorage` (Valkey) giữ phiên, không ghi phiên vào Postgres | DB không chứa token | Đăng nhập phụ thuộc Valkey (mất Valkey = mất phiên); thu hồi theo người dùng phức tạp hơn |

### Nếu chọn A — sửa spec bằng lời (tôi không tự sửa `docs/01–16`)

1. `10` §3.1 `sessions`: đổi `token_hash` → `token` (chuỗi ngẫu nhiên 32 ký tự, cookie ký HMAC); giữ `ip`, `user_agent`, `expires_at`, `is_admin_session`; `last_seen_at` ← `updated_at` (cập nhật theo `updateAge`).
2. `10` §3.1 `users`: bỏ `password_hash` (mật khẩu ở `core.accounts`); `totp_secret_enc`/`totp_enabled` chuyển sang bảng `core.two_factors` + `users.two_factor_enabled` khi làm 2FA.
3. Thêm hai bảng `core.accounts` và `core.verifications` vào danh sách bảng saas-core (`09` §3.1 mục `auth`).
4. `13` §2: ghi rõ mô hình phiên "token thô trong DB + cookie ký HMAC".

### Cần bạn quyết định

1. Chọn A, B, C hay D (khuyến nghị **A**).
2. Nếu A: đồng ý nội dung sửa spec ở trên (tôi chỉ ghi vào `docs/decisions/`, bạn tự sửa `docs/10`, `docs/09`, `docs/13`)?
3. Đặt `updateAge` (chu kỳ ghi `last_seen_at`) = 1 giờ và thời hạn phiên 7 ngày (mặc định của Better Auth)? Hay theo `13` §2 (tôi không được đọc mục này trong phạm vi hiện tại)?
