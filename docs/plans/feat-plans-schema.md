# Kế hoạch `feat-plans-schema` — PLANS-SCHEMA (gói cước, dùng thử, mua thêm lượt)

## Việc

Mã gap matrix: `PLANS-SCHEMA` · Spec: FR-090, US-060, UF-9; `docs/10_Database_Design.md` §3.6 (`plans`, `subscriptions`, `usage_counters`).

**Tóm tắt:** Thêm hai bảng `core.plans` (bảng giá, chỉ đọc, đã nạp sẵn 5 gói của CommentFlow) và `core.subscriptions` (mỗi workspace một gói/sản phẩm: dùng thử 14 ngày/300 lượt hoặc gói trả phí). Ghi vào `subscriptions` và cộng lượt mua thêm chỉ qua ba hàm hệ thống của worker (web không tự nâng gói/tự cộng lượt được). Thêm hàm thuần tính "gói hiệu lực" (hết hạn dùng thử → hạn mức 0) và truy vấn trạng thái gói nối với `usage_counters`. Rủi ro: bảng liên quan tiền/hạn mức nên cần kiểm chứng DB + bảo mật; chưa có nơi gọi trong web/worker nên chưa đổi hành vi chạy thật.

## Điểm chưa rõ

Không có (mọi quyết định tự chọn nằm ở Q-PLN1).

## Tiêu chí nghiệm thu

1. `core.plans` có đúng 5 gói theo docs/10 (trial 14 ngày/300, starter 299k/1/1.000, growth 699k/3/3.000, business 1.490k/10/7.500, addon_1000 149k/+1.000); `cf_app` chỉ SELECT — kiểm bằng `plans.int.test.ts` + `db:check-rls`.
2. `core.subscriptions` có RLS: thành viên workspace A không thấy/ghi được của B; `cf_app` không INSERT/UPDATE/DELETE — kiểm bằng `plans.int.test.ts`.
3. `start_trial` tạo dùng thử một lần/(workspace, sản phẩm), gọi lại không đổi gì (idempotent); `activate_plan` chỉ nhận gói `base` còn bán; `grant_usage_addon` cộng lượt theo gói add-on × số lượng và `consume_usage` dùng được ngay — kiểm bằng int test.
4. Ba hàm chỉ chạy trong `withJob` đúng workspace trên `cf_worker`; web/workspace khác bị 42501 — int test + `check-rls`.
5. `resolvePlanState` đúng mọi nhánh (không có gói, đang dùng thử, hết dùng thử, active, quá hạn, past_due, đã hủy, hủy cuối kỳ, ca biên đúng thời điểm hết hạn) — `packages/shared/src/plan.test.ts`.
6. `readPlanStatus` (saas-core) trả gói hiệu lực + đồng hồ lượt với hạn mức lấy từ gói — unit test; coverage packages không hạ.
7. Mọi lệnh: `lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `test:trace`, `check:migrations`, `test`, `test:db`, `db:check-rls` xanh.

## File sẽ đọc

Đã đọc: `docs/10` §3.6, `0039_usage_counters.sql`, `0052_invoices.sql`, `check-rls.ts` (các hạng mục invoices/usage), `usage-counters.ts`, `usage-meter.ts` (+ test), `shared/usage.ts`, `schema/core/billing.ts`.

## File sẽ sửa / tạo

- `packages/db/src/schema/core/billing.ts` — thêm `plans`, `subscriptions`.
- `packages/db/migrations/0054_plans_subscriptions.sql` (+ snapshot/journal) — bảng, seed `plans`, RLS, 3 hàm DEFINER.
- `packages/db/src/plans.ts` + `runtime.ts` — hàm gọi DB (đọc gói, `startTrial`, `activatePlan`, `grantUsageAddon`, `getPlanStatus`).
- `packages/db/src/check-rls.ts` (+ `check-rls.test.ts`) — hạng mục kiểm mới.
- `packages/db/tests/plans.int.test.ts` — test tích hợp.
- `packages/shared/src/plan.ts` (+ test, export) — `resolvePlanState`, schema đầu vào.
- `packages/saas-core/src/billing/plan-status.ts` (+ test, export) — nối gói với đồng hồ lượt.
- Docs: `docs/10`, gap-matrix, MASTER, codemap.d, quyet-dinh/q-pln1.md, KT, handoff.

## Migration

`0054_plans_subscriptions.sql`: `core.plans`, `core.subscriptions`, seed 5 gói, RLS, hàm `core.start_trial`, `core.activate_plan`, `core.grant_usage_addon`. Đường lùi ghi trong đầu file migration (DROP 3 hàm + 2 bảng; mất dữ liệu gói đã gán).

## Test viết trước

`plan.test.ts` (logic thuần, TDD đỏ trước); `plan-status.test.ts`; `plans.int.test.ts` (RLS chéo workspace, quyền hàm, idempotent, cộng lượt).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/plan.test.ts` · `pnpm --filter @flow/saas-core exec vitest run src/billing` · `CF_LANE=b pnpm test:db` (plans) · `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

Có — verifier-db (migration/RLS) và verifier-security (quyền ghi gói/lượt = tiền), mỗi loại một lần.

## Rủi ro / câu hỏi cho chủ dự án

Bảng giá seed theo docs/10; chủ dự án cần xác nhận giá thật trước khi bán (mục CAN_BAN_CUNG_CAP). Dùng thử không tự gia hạn.

## Đề xuất thay đổi

Cập nhật `docs/10` mô tả cột thực tế của `plans`/`subscriptions` (đã làm trong nhánh, ghi ở Q-PLN1).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới": `plans` không RLS, chỉ SELECT; `subscriptions` không policy ghi (ghi chỉ qua hàm DEFINER `withJob`)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong docs/10 hoặc ghi ở Q-PLN1).
