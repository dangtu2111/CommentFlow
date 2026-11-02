# 001 — Chốt stack công nghệ (đề xuất bản 2, chờ duyệt)

Trạng thái: **Đã duyệt 02/11/2026** (chủ dự án chốt: Better Auth, Drizzle, Biome, Valkey, SeaweedFS thay MinIO — kiểm thật ở H3, lỗi thì báo chứ không tự đổi —, `@flow/*`, cookie i18n, TypeScript 6.0.3, Node 24 LTS, nhánh `chore/scaffold`); phần dưới ghi phiên bản đã xác minh. Căn cứ: `000`, `002-hai-may.md`, `09` §2–3.1 và §10, `16` §3 GĐ0. Đổi mục nào → tạo `00N-*.md` mới.

Tóm tắt: bộ công cụ **ít phụ thuộc, phổ biến, chạy tốt trên Windows**; máy code **không có Docker** (mọi container ở máy ảo, `002`). Giấy phép đều thoáng (MIT/Apache/BSD/PostgreSQL); không còn thành phần AGPL nào.

## 1. Phiên bản đã xác minh (02/11/2026, từ npm registry, nodejs.org, Docker Hub, GitHub)

| Thành phần | Phiên bản ghim | Ghi chú |
|---|---|---|
| Node.js | **24 LTS ("Krypton", hiện 24.22.2) thống nhất cho máy code, máy ảo, Docker và CI**; `.nvmrc` = 24; `engines.node` = `>=24 <25` (chủ dự án chốt 02/11; thay dòng "Node 22" trong `002`) | Node 26.13.0 ("Lithium") vừa thành LTS 28/10 — chưa chọn vì quá mới với module native. Máy code đang Node 22.15 → **phải nâng lên 24 trước khi làm S1** |
| pnpm | 10.24 (đã cài) | ghim bằng `packageManager` |
| Next.js / React | 16.4.4 / 19.3.1 | |
| next-intl | 4.14.9 | |
| TypeScript | **6.0.3** ghim từ đầu (chủ dự án chốt); không thử 7.x ở giai đoạn scaffold | 7.0.2 là bản `latest` nhưng chưa kiểm với Next/Drizzle/Vitest; xét lại sau scaffold bằng ADR riêng |
| Better Auth | 1.7.15 | |
| Drizzle ORM / drizzle-kit | 0.45.4 / 0.31.11 | |
| pg | 8.23.1 | |
| pg-boss | 12.38.0 | chỉ dùng Postgres, **không dùng Redis/Valkey** |
| Zod | 4.6.7 | |
| pino | 10.4.0 | |
| Vitest | 5.0.5 | |
| Biome | 2.6.4 | |
| dependency-cruiser | 18.7.1 | |
| tsx | 4.23.15 | |
| Postgres + pgvector | `pgvector/pgvector:0.8.7-pg16` | PostgreSQL 16 theo `09` |
| Valkey | `valkey/valkey:8.1.11-alpine` | Langfuse ghi "Valkey ≥ 8 chính thức"; LiteLLM coi Valkey là thay thế trực tiếp Redis; có 9.1.3 nhưng chọn 8.1 vì là bản Langfuse nêu; nâng sau khi đo |
| Langfuse | `docker.langfuse.com/langfuse/langfuse:4` và `langfuse-worker:4` (hiện 4.72.0) | cần Valkey với `maxmemory-policy noeviction`, ClickHouse, S3 |
| ClickHouse | `clickhouse/clickhouse-server:26.3.62.3` | đúng bản compose chính thức của Langfuse |
| S3 | **SeaweedFS 4.52** (`chrislusf/seaweedfs`) | xem mục 3 |
| LiteLLM | `ghcr.io/berriai/litellm`, bản ổn định **v1.106.6** | tên tag chính xác kiểm ở H2 (đăng ký ghcr cần token để liệt kê) |
| Python / uv | 3.12 / uv mới nhất | máy code chưa có; kiểm ở CI và máy ảo |

## 2. Các lựa chọn chính

| Hạng mục | Chọn | Giấy phép | Lý do | Đã loại |
|---|---|---|---|---|
| Monorepo | pnpm workspaces, không Turborepo | MIT | `node_modules` nghiêm ngặt hợp luật ranh giới | npm/Yarn/Bun/Nx |
| Web | Next.js App Router + next-intl, ngôn ngữ lưu **cookie**, URL không có `/vi` `/en` (trang công khai/SEO ở GĐ3 xét lại) | MIT | `09` §2, `08` §8 | — |
| ORM/migration | Drizzle + drizzle-kit, migration là SQL; RLS/role/extension/trigger viết SQL tay; driver `pg` | Apache-2.0 / MIT | Multi-schema `core`/`cf`, `vector`/`halfvec`, kiểu suy ra từ schema | Prisma; Kysely |
| Auth | **Better Auth** — chỉ lõi đăng ký/đăng nhập/phiên (email + mật khẩu). 2FA TOTP, quên mật khẩu, lời mời làm nhánh sau. Workspace/thành viên/lời mời vẫn là bảng của `saas-core` (RLS), **không** dùng plugin organization | MIT | Chủ dự án chốt. Giảm mã bảo mật phải tự viết | tự viết mỏng (bản 1); Auth.js; Clerk/Auth0 |
| Hàng đợi | pg-boss | MIT | Chỉ cần Postgres. **Không bị ảnh hưởng khi đổi Redis→Valkey** | — |
| Cache/khóa/giới hạn tốc độ | **Valkey 8.1** (BSD-3) | BSD-3 | Redis ≥ 7.4 đổi giấy phép; Valkey tương thích giao thức. Khách dùng Valkey: LiteLLM (cache), Langfuse (BullMQ). Lưu ý của LiteLLM: nếu dùng ACL user thì phải cấp quyền kênh pub/sub; dev dùng mật khẩu `--requirepass` không ACL | Redis 7.2 (hết bản vá dài hạn, giấy phép đổi) |
| Gọi LLM | `fetch` + Zod tới LiteLLM | — | Một cổng, ít phụ thuộc | SDK trong app |
| Log | pino + danh sách che | MIT | Bất biến #6 | — |
| Test | Vitest (TS), pytest (Python); **integration test chạy với `TEST_DATABASE_URL` (DB `cf_test` trên máy ảo, tạo lại schema mỗi lần), không Testcontainers**; CI dùng service container; Playwright thêm khi có giao diện đăng nhập | MIT / Apache-2.0 | `002` | Jest |
| Lint/format | **Biome** (TS), ruff (Python) | MIT / Apache-2.0 | Chủ dự án chốt | ESLint+Prettier toàn bộ |
| Kiểm chuỗi giao diện viết cứng | Biome **không** có luật này → **ESLint chỉ một luật** `no-literal-string` của `eslint-plugin-i18next`, chỉ cho `apps/web` (`pnpm lint:i18n`); Biome lo phần còn lại (chủ dự án chốt) | ISC (plugin) / MIT (ESLint) | FR-119, `14` §2 | script tự viết |
| Ranh giới gói | dependency-cruiser | MIT | `09` §3.1 | — |
| Quét bí mật | gitleaks (binary, không dùng action cần license) | MIT | spec | — |
| CI | GitHub Actions, `ubuntu-latest`, action bên thứ ba ghim theo mã commit | — | `15` §6 | — |
| `nextjs/saas-starter` | **Không dùng làm nền**; chỉ tham khảo | MIT | Đã xác minh: Drizzle + Postgres, email/mật khẩu với JWT trong cookie, Stripe, nhóm Owner/Member, tự mô tả "mẫu tối thiểu để học"; không thấy 2FA và RLS; commit gần nhất 11/12/2025, chưa lưu trữ. Lệch spec (Stripe vs chuyển khoản tay; không RLS; sessions) | — |

## 3. Object storage: MinIO → SeaweedFS

Điều kiện chủ dự án đặt ("chỉ chuyển nếu image không khả dụng hoặc không ổn định") **đã xảy ra**:
- Kho `minio/minio` trên GitHub đã **lưu trữ (archived)**, lần đẩy cuối 24/04/2026 (kiểm qua GitHub API).
- Image `minio/minio` không còn trên Docker Hub (API trả "object not found"; chỉ còn `minio/mint`).
- Các bài viết bên thứ ba: ngừng phát hành image 10/2025, chế độ bảo trì 12/2025, lưu trữ kho 02/2026 (chưa có thông báo chính thức đối chiếu được); chỉ còn các bản dựng lại từ nguồn của bên thứ ba (ví dụ `pgsty/minio`, `cgr.dev/chainguard/minio`).

Chọn **SeaweedFS** (Apache-2.0; kho còn hoạt động, đẩy mã ngày 02/11/2026, bản 4.52): tài liệu Langfuse liệt kê **SeaweedFS là backend chính thức**. Lưu ý bắt buộc: `LANGFUSE_S3_*_FORCE_PATH_STYLE=true`; **luôn truyền file danh tính (identities)** nếu không S3 không xác thực; khóa truy cập cần quyền List/Get/Put/Delete. Loại: Garage (AGPL, Langfuse không nêu), RustFS (mới, Langfuse không nêu), bản MinIO dựng lại bởi bên thứ ba. Chưa chạy thử thật — kiểm ở bước H3.

## 4. Hạ tầng Compose: hai project trên máy ảo

| Project | Chạy | Dịch vụ | Publish cổng ra LAN |
|---|---|---|---|
| `cf-dev` | máy ảo (40 GB) | postgres (DB `cf_dev`, `cf_test`, `litellm`, `langfuse`), valkey, ml, litellm, langfuse-web, langfuse-worker, clickhouse, seaweedfs | **5433** Postgres, **6380** Valkey, **8001** ml, **4000** LiteLLM, **3100** Langfuse |
| `cf-staging` | máy ảo | đủ 7 dịch vụ (thêm web, worker), 2 project Langfuse tách khỏi dev, role/mật khẩu riêng | **không** publish Postgres/Valkey; web ra internet qua Cloudflare Tunnel (GĐ3) |

- File: `infra/docker-compose.yml` (nền, không có `ports:`), `docker-compose.dev.yml`, `docker-compose.staging.yml` (khớp `15` §4); chạy bằng `-p cf-dev` / `-p cf-staging`.
- Ghim phiên bản image theo mục 1; mọi dịch vụ có health check, `restart: unless-stopped`, giới hạn RAM.
- Health check: postgres `pg_isready`; valkey `valkey-cli ping` (có mật khẩu); clickhouse `/ping`; seaweedfs cổng S3; litellm `/health/liveliness`; langfuse-web `/api/public/health`; langfuse-worker `/api/health` (cổng 3030); ml `/health`; web `/api/health`; worker `/health`.
- Khóa Valkey ở dev có prefix `dev:`; Langfuse 2 project (dev, staging); LiteLLM 2 virtual key có ngân sách riêng (`002`).
- Chặn migration nhầm: `db:migrate` chỉ chạy với `APP_ENV` ∈ {dev,test,ci} và tên DB ∈ {`cf_dev`,`cf_test`,`cf_ci`}; staging/production chỉ qua job CI có duyệt (`15` §6).

## 5. RAM dự kiến (ước tính, **đo ở bước H3/H4**; máy ảo 40 GB, máy code không chạy container)

| Container | Không tải | Giới hạn trong compose |
|---|---|---|
| postgres | 300–500 MB | 1 GB |
| valkey | 20–50 MB | 256 MB |
| clickhouse | 500 MB–1,2 GB | 1,5 GB |
| seaweedfs | 100–250 MB | 512 MB |
| langfuse-web | 400–700 MB | 1 GB |
| langfuse-worker | 300–500 MB | 768 MB |
| litellm | 500–900 MB | 1,2 GB |
| ml (chỉ `/health`) | 100–150 MB | 512 MB |
| **`cf-dev` (8 container)** | **≈ 2,2–4,3 GB** | **≈ 6,8 GB** |
| thêm `web` + `worker` → **`cf-staging` (10 container)** | **≈ 2,5–4,8 GB** | **≈ 7,7 GB** |
| **Cả hai project cùng chạy** | **≈ 4,7–9 GB** | ≈ 14,5 GB |

- Khi `ml` nạp bge-m3 + reranker (GĐ2 trở đi): **+3–4 GB mỗi project** → cả hai ≈ 11–17 GB; vẫn dưới 40 GB, còn chỗ cho hệ điều hành và các runner.
- Máy code (31,9 GB RAM): chỉ chạy Node (dev server ≈ 0,5–1 GB) → không còn bài toán giới hạn WSL2; quyết định cũ "chạy Langfuse thường trực hay không" chuyển thành: **luôn chạy ở `cf-dev`** trên máy ảo.
- Langfuse khuyến nghị VM ≥ 4 lõi/16 GB cho sản xuất; ở đây tải rất thấp nên dùng giới hạn trên là đủ — số đo thật thay bảng này.

## 6. Ghi nhận và điều chưa xác minh

- Ngoại lệ nguyên tắc #2: khóa Valkey hệ thống trước khi có workspace (giới hạn đăng nhập) dùng tiền tố `sys:`.
- **Chưa xác minh:** Better Auth có lưu token phiên thô hay băm, và ánh xạ được vào `core.users`/`core.sessions` (spec `10` §3.1 có `token_hash`) → bước C0; SeaweedFS chạy với Langfuse thật → H3; tag chính xác của LiteLLM → H2; `ml` chưa chạy cục bộ (máy code thiếu uv/Python 3.12).
- Mỗi lần thêm thư viện: ghi tên, lý do, giấy phép vào đây trong cùng commit.

## 7. Thư viện đã thêm trong nhóm S (S1–S8)

| Thư viện | Dùng ở | Giấy phép | Lý do |
|---|---|---|---|
| `@biomejs/biome` 2.6.4, `typescript` 6.0.3 | gốc | MIT/Apache-2.0, Apache-2.0 | Lint/format; trình biên dịch (theo mục 2) |
| `zod` 4.6.7 | shared, worker | MIT | Kiểm dữ liệu ở ranh giới |
| `vitest` 5.0.5, `@types/node` 24 | mọi gói TS | MIT | Test; kiểu Node |
| `next` 16.4.4, `react`/`react-dom` 19.3.1, `next-intl` 4.14.9 | web | MIT | Theo mục 2 |
| `pino` 10.4.0 | worker | MIT | Log có che bí mật/PII |
| `tsx` 4.23.15 | worker | MIT | Chạy TypeScript trực tiếp (dev và Docker), không cần bước đóng gói; gói nội bộ được dùng từ mã nguồn |
| `dependency-cruiser` 18.7.1 | gốc, tools/boundaries | MIT | Ranh giới gói |
| `eslint` 10.14.0, `eslint-plugin-i18next` 6.1.5, `typescript-eslint` 8.72.1 | web (chỉ cho luật i18n) | MIT, ISC, MIT/BSD-2 | Chốt ở câu 1 |
| Python: `fastapi` 0.162.0, `uvicorn` 0.54.0 / dev: `pytest` 9.2.0, `httpx` 0.28.1, `ruff` 0.17.3; công cụ `uv` 0.13.6 | ml | MIT, BSD-3 / MIT, BSD-3, MIT; uv Apache-2.0/MIT | Theo mục 2 |

CI (`.github/workflows/ci.yml`) chỉ dùng `actions/checkout` và `actions/setup-node` (ghim theo mã commit); `pnpm` qua corepack, `uv` qua `pipx` bản ghim, gitleaks 8.30.1 tải về kèm kiểm checksum — không dùng action bên thứ ba.

Phát hiện khi làm S3: bản dịch phải nạp bằng import tĩnh (import động theo tên gói làm `next build` xanh nhưng chạy thật lỗi 500) — đã có test + kiểm chạy thật.
