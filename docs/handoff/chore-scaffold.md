# Bàn giao — nhánh `chore/scaffold`

Cập nhật: 2026-11-03 · Mục gap matrix: GĐ0-* (xem `docs/gap-matrix.md`) · Agent vừa làm: claude · Commit cuối: xem `git log -1`
Kế hoạch: `docs/plans/chore-scaffold.md`

## Đã làm
- **Nhóm S (S1–S8):** monorepo pnpm, Biome, TypeScript 6.0.3, `@flow/shared`, `apps/web` (Next 16 + next-intl cookie), `apps/worker`, `services/ml`, dependency-cruiser + test luật, kiểm chuỗi viết cứng (ESLint một luật), CI (4 job).
- **Nhóm H:** Compose `cf-dev` trên máy ảo (8 container, 5 cổng), SeaweedFS thay MinIO, Valkey, LiteLLM `mock-llm`, Langfuse, script sinh bí mật và `cf-dev.mjs`, `stack-check`. H5 (staging) **hoãn đến khi có tên miền**.
- **Nhóm C:** `@flow/db` (schema core/cf, 5 migration, RLS, `withWorkspace`, `check-rls`), `saas-core` (tenancy, auth Better Auth theo ADR 003, flags), `packages/ai` (`callLlm` + `ai_usage` + `maskPii`), pg-boss trong worker, job `database` trong CI.
- **Kiểm chứng độc lập một lần:** `verifier-security` + `verifier-db` → 0 mục "Chặn merge"; đã sửa phần lớn "Nên sửa" (migration 0003/0004, `check-rls` chặt hơn, `readSession` hạn cứng Admin 8 giờ, cookie Secure theo `baseURL`, log che thêm trường, `batchSize: 1`, siết `cf-dev-command`).
- Spec đã sửa (được cho phép một lần): `docs/09` §3.1, `docs/10` v1.2, `docs/13` v0.7; ADR `001`, `002`, `003`.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `docs/decisions/003-auth-better-auth.md` | Token phiên lưu thô + cookie ký HMAC; argon2id tùy chỉnh; mã dự phòng 2FA `encrypted`; không dùng impersonation của plugin admin |
| `packages/db/migrations/0001,0004` | Policy tách theo lệnh; đọc chéo workspace chỉ khi không có ngữ cảnh workspace; `cf_app` không DELETE `workspaces`/`users`, không UPDATE `is_admin`/`admin_role` |
| `packages/saas-core/src/auth/session.ts` | Better Auth đặt lại hạn phiên mỗi lần làm mới → hạn cứng Admin phải kiểm theo `createdAt` ở `readSession` |
| `.env` (máy code) | Do **chủ dự án** sinh bằng `ssh cf "~/CommentFlow/infra/scripts/print-dev-env.sh" > .env`; agent không đọc/chạy. Muốn chạy test gọi LiteLLM thật: chạy lại script sau khi tạo khóa ảo (`scripts/cf-dev-litellm-key.sh` đã chạy trên máy ảo) |

## Quyết định đã chốt trong phiên
- TypeScript 6.0.3; Node 24 LTS; Better Auth + Drizzle + Biome; Valkey 8.1; SeaweedFS (MinIO đã ngừng); `@flow/*`; ngôn ngữ lưu cookie; một nhánh `chore/scaffold` rồi merge `main`.
- Máy code không có Docker; test tích hợp dùng `cf_test` trên máy ảo; migrate chỉ DB `cf_dev`/`cf_test`/`cf_ci`.

## Còn lại (theo thứ tự)
1. Chủ dự án quyết các mục ở "Quyết định cần chủ dự án" trong gap matrix (kill_switch override, `members.status`, spec `10` §4/`13` §4, `ai_enabled`).
2. Merge `chore/scaffold` → `main` (chưa merge/push `main`).
3. `UI-AUTH` + design tokens (cần `/stitch-sync` và đọc `08` §2), `AUTH-RATELIMIT` (bắt buộc trước khi mở endpoint), `AUTH-2FA`, `AUTH-FORGOT`, `AUTH-INVITE`.
4. Khi có tên miền: `STAGING-DEPLOY` (H5), `QUEUE-PROD-INSTALL`, `DB-BOOTSTRAP`.

## Lệnh test liên quan
```
pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm test && pnpm depcruise
pnpm test:db          # cần .env + máy phụ bật
pnpm stack:check      # kiểm 5 cổng cf-dev từ máy code
```
