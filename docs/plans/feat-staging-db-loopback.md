# Kế hoạch `feat/staging-db-loopback` — Cổng Postgres staging chỉ nghe 127.0.0.1

Mã gap matrix: `STAGING-DB-LOOPBACK` (con của `STAGING-MIGRATE`) · Spec: `docs/15_Deployment_Architecture.md` §2, §6.

**Tóm tắt (2–3 câu):** workflow migrate staging chạy trên runner đặt cùng máy ảo, cần một `host:cổng` để nối tới Postgres, nhưng compose staging hiện không mở cổng nào. Ta mở cổng Postgres **chỉ ở `127.0.0.1`** (loopback = chỉ chính máy ảo nối được, không ai từ mạng ngoài), và thêm một test tự động đọc compose để không ai vô tình đổi thành `0.0.0.0`. Rủi ro: nếu ai đó sửa thành cổng công khai thì DB lộ ra mạng — test này chặn lỗi đó.

## Điểm chưa rõ

Không có (cổng mặc định 5434 và tên biến `CF_STAGING_DB_PORT` do yêu cầu việc đã chốt; ghi ở QUYET_DINH_CHO_DUYET).

## Tiêu chí nghiệm thu

1. Compose staging publish Postgres dạng `127.0.0.1:${CF_STAGING_DB_PORT:-5434}:5432` — kiểm bằng: test đọc `infra/docker-compose.staging.yml`.
2. Mọi `ports` của service `postgres` trong compose nền + staging bắt đầu bằng `127.0.0.1:` (không `0.0.0.0`, không bỏ trống host) — kiểm bằng: `pnpm --filter @flow/scripts exec vitest run lib/compose-ports.test.mjs` (có ca đỏ cho `0.0.0.0`, `5432:5432`, `[::]`, dạng object).
3. `env.cf-staging.example` có `CF_STAGING_DB_PORT` (chỉ tên); `STAGING_SETUP.md` bỏ mục "Còn mở" về đường nối DB và hướng dẫn `CF_STAGING_DB_HOSTS=127.0.0.1:5434` — kiểm bằng: grep + test đối chiếu tên biến.
4. `pnpm lint`, `pnpm check:plans`, `pnpm test:trace` xanh.

## File sẽ đọc

`infra/docker-compose.yml` (khối postgres), `infra/docker-compose.staging.yml`, `infra/env.cf-staging.example`, `docs/STAGING_SETUP.md` (mục "Còn mở", E), `docs/staging/H5-CHECKLIST.md`, mẫu test `scripts/lib/migrations-check.test.mjs`.

## File sẽ sửa / tạo

Sửa: compose staging, `env.cf-staging.example`, `STAGING_SETUP.md`, `H5-CHECKLIST.md`, `docs/gap-matrix.md`, `docs/codemap.md`, `QUYET_DINH_CHO_DUYET.md`. Tạo: `scripts/lib/compose-ports.mjs` + `.test.mjs`, handoff, plan này.

## Migration

Không có.

## Test viết trước

`scripts/lib/compose-ports.test.mjs` (đỏ trước khi sửa compose và trước khi có hàm).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/scripts exec vitest run lib/compose-ports.test.mjs`

## Cần kiểm chứng độc lập không?

Không (không đụng auth/RLS/token trong code; chỉ cấu hình mạng + test). Chủ dự án xem lại dòng `ports`.

## Rủi ro / câu hỏi cho chủ dự án

Runner phải chạy cùng máy ảo với Docker thì `127.0.0.1:5434` mới tới được (đúng thiết kế runner `cf-staging`). TLS Postgres vẫn là việc mở, không cần khi đi loopback.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (theo AGENTS.md § Quy tắc hỏi: agent tự chọn phương án khuyến nghị; ghi ở `QUYET_DINH_CHO_DUYET.md`).
