# Bàn giao — nhánh `feat-usage-counters`

Cập nhật: 2026-11-06 · Mục gap matrix: USAGE-COUNTERS · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-usage-counters.md`

## Đã làm
- Logic thuần `packages/shared/src/usage.ts` (test viết trước, đỏ rồi xanh): `usageStatus`, `canConsume`, `usagePeriodStart`, `parseConsumeInput`.
- Migration `0039_usage_counters.sql`: bảng `core.usage_counters` (cf_app chỉ SELECT) + hàm DEFINER `core.consume_usage` (chỉ `withJob`/`cf_worker` của đúng workspace).
- `packages/db/src/usage-counters.ts` (`consumeUsage`, `getUsageCounter`), `check-rls.ts` (hàm cho phép, no-delete, cột cấm ghi, `checkUsageFunction`) + test.
- `packages/saas-core/src/billing/usage-meter.ts` (`createUsageMeter`) + test (db giả).
- Int test `packages/db/tests/usage-counters.int.test.ts` (đua, chéo workspace, quyền).

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `migrations/0031` | Mẫu hàm DEFINER chỉ `cf_worker`: kiểm `session_user`, `is_system_context()`, REVOKE PUBLIC/cf_app, GRANT cf_worker |
| `check-rls.ts` | Danh sách cho phép EXECUTE trực tiếp của cf_worker nằm ở `checkWorkerDirectPrivileges` (đã thêm `core.consume_usage`) |
| `packages/db/tests/helpers.ts` | `createWorkerDb` cho `withJob` là hệ thống; `createWebDb` cho cf_app |

## Quyết định đã chốt trong phiên
- Q-UC1 (xem `docs/plans/QUYET_DINH_CHO_DUYET.md`): `limit_amount`, hạn mức do nơi gọi truyền mỗi lần, `addon` chưa có đường ghi, chưa nối pipeline.

## Còn lại (theo thứ tự)
1. **Chạy `CF_LANE=b pnpm test:db` + `pnpm db:check-rls`**: phiên này KHÔNG chạy được (cụm DB test thiếu role `cf_worker` → migration 0030 lỗi ở mọi nhánh; tạo role bằng `pnpm cf:dev add-worker-role` / init script). CI job `database` sẽ chạy.
2. `USAGE-GATE-PIPE`: nối `consume` vào pipeline AI (khóa idempotent theo bình luận), `PLANS-SCHEMA` cấp hạn mức thật, `USAGE-METER-UI`.
3. Hàm DEFINER thêm lượt mua thêm (`addon`) ở việc mua thêm.

## Lệnh test liên quan
```
pnpm --filter @flow/shared run test
pnpm --filter @flow/saas-core run test src/billing
pnpm --filter @flow/db run test
CF_LANE=b pnpm test:db
pnpm db:check-rls
```
