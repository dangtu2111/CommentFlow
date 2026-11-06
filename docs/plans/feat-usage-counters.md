# Kế hoạch `feat-usage-counters` — USAGE-COUNTERS (bộ đếm lượt AI)

## Việc

Mã gap matrix: `USAGE-COUNTERS` (MASTER) · Spec: FR-090, BR-03/BR-06, US-060, `docs/10` §3.6 `usage_counters`, `docs/09` §3.1 (`meter` do sản phẩm khai báo).

**Tóm tắt:** Thêm bảng đếm số lượt AI mỗi workspace theo kỳ (tháng), có hạn mức. Mỗi lần AI xử lý một bình luận/tin, code gọi một hàm DB nguyên tử (không bị đếm sai khi hai worker chạy cùng lúc): còn hạn mức thì trừ, chạm 80% thì đánh dấu cảnh báo, đủ 100% thì **chặn** (không trừ, ghi `blocked_at`). Chỉ phần đếm + chặn; giao diện đồng hồ (`USAGE-METER-UI`), gói cước/mua thêm (`PLANS-SCHEMA`) và nối vào pipeline AI là việc sau. Rủi ro: bảng + hàm quyền cao (DEFINER) nên cần verifier-db + verifier-security một lần.

## Điểm chưa rõ

Không có (mọi quyết định tự chọn, ghi ở `QUYET_DINH_CHO_DUYET.md` mã Q-UC1).

## Tiêu chí nghiệm thu

1. Hạn mức: `usageStatus` trả `ok` dưới 80%, `warning` từ 80% đến dưới 100%, `blocked` khi hết (kể cả limit 0), `remaining` không âm, `addon` cộng vào hạn mức — kiểm bằng `packages/shared/src/usage.test.ts` (FR-090).
2. Kỳ tính: `usagePeriodStart` trả ngày 1 của tháng theo múi giờ workspace (ca biên 23:59 cuối tháng / 00:00 đầu tháng, múi giờ lạ → lỗi) — `usage.test.ts`.
3. Còn hạn mức thì trừ và trả `allowed`; vượt thì KHÔNG trừ, ghi `blocked_at` một lần, trả `allowed=false` — `packages/db/tests/usage-counters.int.test.ts`.
4. Chạm 80% lần đầu trả `warnedNow=true` và ghi `warned_80_at` đúng một lần — int test.
5. Đua: 20 lệnh `consume` song song với hạn mức 10 → đúng 10 `allowed`, `used = 10` — int test (DB thật).
6. Chỉ hệ thống ghi được: `cf_app` (web) không INSERT/UPDATE/DELETE trực tiếp và không gọi được hàm; hàm từ chối ngữ cảnh không phải job của đúng workspace; workspace B không thấy bộ đếm của A; thành viên đọc được của workspace mình — int test + `pnpm db:check-rls` đạt.
7. Đầu vào sai (số lượng ≤ 0, hạn mức âm, sản phẩm/meter lạ, product-meter không hợp lệ) bị từ chối — unit test (`saas-core` `usage-meter.test.ts`) + int test.
8. Lõi `saas-core` `createUsageMeter` tính kỳ theo múi giờ, gọi `withJob`, trả kết quả có `status` — `packages/saas-core/src/billing/usage-meter.test.ts` (unit, db giả).
9. Công cụ xanh: `pnpm lint && lint:i18n && typecheck && depcruise && check:plans && check:migrations && test:trace`, `test:coverage` của `shared`/`saas-core`, `CF_LANE=b pnpm test:db`, `db:check-rls`.

## File sẽ đọc

Đã đọc: `docs/workflows/{feature,finish}.md`, `docs/testing/STANDARD.md`, `docs/codemap.md`, `docs/10` §3.6, `migrations/0031` (mẫu hàm DEFINER cf_worker), `0034` (mẫu RLS), `check-rls.ts` (danh sách quyền), `stuck-outbox.ts` + test (mẫu gọi hàm + test).

## File sẽ sửa / tạo

- `packages/shared/src/usage.ts` (+ `usage.test.ts`, export ở `index.ts`) — logic thuần: trạng thái hạn mức, kỳ tính, kiểm đầu vào.
- `packages/db/src/schema/core/billing.ts` (+ export ở `schema/core/index.ts`) — bảng `core.usage_counters`.
- `packages/db/migrations/0039_usage_counters.sql` (+ `meta/`) — bảng, RLS, hàm DEFINER `core.consume_usage`.
- `packages/db/src/usage-counters.ts` (+ export ở `runtime.ts`) — `consumeUsage` (trong `withJob`), `getUsageCounter` (đọc).
- `packages/db/src/check-rls.ts` (+ test) — thêm hàm vào danh sách cho phép của `cf_worker`, kiểm hàm `consume_usage`, cấm GHI trực tiếp, không DELETE.
- `packages/saas-core/src/billing/usage-meter.ts` (+ test, export) — `createUsageMeter`.
- `packages/db/tests/usage-counters.int.test.ts` — tích hợp.
- `docs/10` §3.6 (cột `limit` → `limit_amount`, ghi quyền), `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/handoff/feat-usage-counters.md`.

## Migration

`0039_usage_counters.sql` (chỉ làn b): `core.usage_counters(workspace_id, product, meter, period_start date, used, limit_amount, addon, warned_80_at, blocked_at, created_at, updated_at)`, PK = (workspace_id, product, meter, period_start); CHECK `used/limit_amount/addon >= 0`, `product`, `meter` đúng dạng; RLS: SELECT cho thành viên/ngữ cảnh trần/hệ thống của đúng workspace; `cf_app` chỉ SELECT. Hàm `core.consume_usage(...)` SECURITY DEFINER: chỉ cho `withJob` của đúng workspace trên kết nối `cf_worker`; EXECUTE chỉ `cf_worker`.
Đường lùi: `DROP FUNCTION core.consume_usage(uuid,text,text,integer,date,integer); DROP TABLE core.usage_counters;` + lùi `check-rls.ts`. Mất số đếm kỳ hiện tại (đếm lại không được — chỉ lùi khi chưa có nơi gọi).

## Test viết trước

Hạn mức/kỳ tính (STANDARD §4: hạn mức và đồng hồ lượt): `usage.test.ts` viết và chạy ĐỎ trước `usage.ts`; `usage-counters.int.test.ts` viết trước hàm SQL (ca biên đúng ngưỡng 80%/100%, ±1, đua 20 song song, chéo workspace).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/usage.test.ts` · `pnpm --filter @flow/saas-core exec vitest run src/billing` · `CF_LANE=b pnpm test:db` (file `usage-counters.int.test.ts`) · `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

**Có** — migration + RLS + hàm DEFINER (`verifier-db`) và chặn hạn mức / quyền ghi (`verifier-security`), mỗi loại một lần ở cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

- Chưa có nơi gọi `consume` trong pipeline AI (chờ PIPE-*): ghi gap `USAGE-GATE-PIPE`. Mỗi lượt phải trừ ĐÚNG MỘT lần — nơi gọi cần khóa idempotent theo bình luận (không làm ở đây).
- Hạn mức thật đến từ gói cước (`PLANS-SCHEMA` ⛔ chờ bảng giá): hiện caller truyền `limit`.

## Đề xuất thay đổi

`docs/10` §3.6: đổi tên cột `limit` → `limit_amount` (`limit` là từ khóa SQL), ghi PK, quyền ghi chỉ hàm DEFINER.

## Complexity tracking

Không có (không thư viện mới; `saas-core/billing` mới nhưng đúng kiến trúc `docs/09` §3.1 và có ≥ 2 nơi dùng dự kiến: CommentFlow `ai_turns` + ExcelFlow).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

Policy GHI: **không có policy ghi cho `cf_app`** — chỉ hàm DEFINER (đường `withJob`/`cf_worker`) ghi; người dùng chỉ đọc.

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi ở Q-UC1).
