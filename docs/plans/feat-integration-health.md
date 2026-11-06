# Kế hoạch `feat-integration-health` — ADMIN-INTEGRATION-HEALTH (FR-104)

## Việc

Mã gap matrix: `ADMIN-INTEGRATION-HEALTH` · Spec: FR-104, US-083, `docs/11` §Admin (`/admin/dead-letters`), `docs/13` §3.2, `docs/15` (giám sát pg-boss), `docs/10` §3.2 (`webhook_events` dead letter).

**Tóm tắt:** Thêm nơi ghi lại lỗi gọi nhà cung cấp ngoài (Facebook, Shopify, LLM…) và các truy vấn tổng hợp cho trang quản trị: số lỗi theo nhà cung cấp, danh sách dead letter (webhook lỗi hết lượt), kèm bộ đánh giá "ổn / suy giảm / sập" thuần. Chỉ Super Admin xem được (docs/13 §3.2). Rủi ro: có migration (0059) và hàm DB đặc quyền (DEFINER) → cần verifier-db + verifier-security một lần. Chưa làm giao diện, chưa làm nút Thử lại/Bỏ qua, chưa đọc số liệu pg-boss thật.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn, ghi Q-AIH1).

## Tiêu chí nghiệm thu

1. `canViewIntegrationHealth`: chỉ `isAdmin` + `super`; support/finance/null/vai trò lạ/không-admin → false — `pnpm --filter @flow/shared exec vitest run src/integration-health.test.ts`.
2. Đánh giá sức khỏe: nhà cung cấp 0 lỗi=ok, ≥1=degraded, ≥20=down; `ingest` chờ > 300 giây = down (docs/15), hàng đợi khác > 1800 giây; có dead letter ≥ degraded; số liệu hỏng (NaN/âm) → down — cùng test.
3. `sanitizeIncidentMessage` che email/SĐT/chuỗi giống token và cắt 300 ký tự (bất biến #6) — cùng test.
4. Bảng `cf.integration_incidents` có RLS: chỉ hệ thống (`cf_worker`, `withJob`) ghi; đường người dùng/web bị từ chối 42501; không ghi chéo workspace; nhà cung cấp lạ bị CHECK; workspace khác không thấy dòng của nhau — `pnpm test:db` (`packages/db/tests/integration-health.int.test.ts`).
5. `cf.admin_integration_health` và `cf.admin_dead_letters` chỉ Super Admin gọi được; support, finance, Owner, không người dùng, ngữ cảnh hệ thống → 42501; dead letter không lộ payload, lỗi được che PII — cùng test tích hợp.
6. `pnpm db:check-rls` logic (test `check-rls.int.test.ts` trong `test:db`) xanh với bảng mới.
7. Công cụ: `lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `test:trace`, `--filter @flow/shared test:coverage`, `check:migrations` xanh.

## File sẽ đọc

`packages/db/src/client.ts` (ngữ cảnh withJob/withUser), `packages/db/src/check-rls.ts` (kỳ vọng policy), `packages/db/migrations/0058_msg_store.sql` (mẫu RLS), `0022*.sql` (mẫu DEFINER), `packages/db/src/schema/cf/webhook-events.ts`, `packages/db/tests/helpers.ts`, `packages/shared/src/pii.ts`.

## File sẽ sửa / tạo

- Tạo `packages/shared/src/integration-health.{ts,test.ts}` + export trong `packages/shared/src/index.ts`.
- Tạo `packages/db/src/schema/cf/integration-incidents.ts` (+ export trong `schema/cf/index.ts`), `packages/db/src/queries/integration-health.ts` (+ export `runtime.ts`), `packages/db/tests/integration-health.int.test.ts`.
- Migration `packages/db/migrations/0059_integration_health.sql` (+ journal/snapshot sinh bởi drizzle-kit).
- Sửa `packages/db/src/check-rls.ts` (kỳ vọng policy + cột bất biến).
- Docs file riêng: `docs/plans/quyet-dinh/q-aih1.md`, `docs/codemap.d/cay-packages-db-src-queries-integration-health-ts.md` + `cay-packages-shared-src-integration-health-ts.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-aih.md`; dòng MASTER; `docs/handoff/feat-integration-health.md`.

## Migration

0059: bảng `cf.integration_incidents` (workspace_id NOT NULL, provider/kind CHECK, code ≤ 64, message ≤ 300); RLS: SELECT thành viên hoặc không người dùng, INSERT chỉ `is_system_context()`; không UPDATE/DELETE. Hàm DEFINER `cf.assert_super_admin()`, `cf.admin_integration_health(timestamptz)`, `cf.admin_dead_letters(integer)` (EXECUTE chỉ `cf_app`). Đường lùi ghi đầu file migration.

## Test viết trước

Logic thuần (tiêu chí 1–3) có test; RLS/hàm DB (4–5) bằng test tích hợp trên `cf_test`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/integration-health.test.ts` · `pnpm test:db` (làn b).

## Cần kiểm chứng độc lập không?

Có — migration + hàm DEFINER + phân quyền Admin: `verifier-db` và `verifier-security`, mỗi bên một lần.

## Rủi ro / câu hỏi cho chủ dự án

- Hàm DEFINER tin `app.user_id` do web đặt (giới hạn ADR 005 §3): web bị chiếm hoàn toàn thì tự giả được Super Admin. Giảm nhẹ: không trả payload/PII, chỉ số liệu tổng hợp và lỗi đã che.
- Chưa có chỗ nào gọi `recordIntegrationIncident` (nối vào connector → gap `INTEGRATION-HEALTH-WIRE`); chưa có dòng nào ngoài test.
- Số liệu pg-boss → `INTEGRATION-HEALTH-QUEUE-WIRE`; giao diện + Thử lại/Bỏ qua → `INTEGRATION-HEALTH-UI`; job dọn sự cố cũ → `INTEGRATION-HEALTH-RETENTION`.

## Đề xuất thay đổi

Không đổi docs/01–16 (docs/10 thêm mục bảng mới ghi qua Q-AIH1).

## Complexity tracking

Hàm DEFINER chéo workspace: đi ngoài `withWorkspace` (nguyên tắc #2) vì Admin cần tổng hợp xuyên workspace; phương án đơn giản hơn (bảng không RLS cho cf_app) bị loại vì mở cho mọi workspace. Hàm tự kiểm vai trò Super Admin.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR; lựa chọn riêng ghi Q-AIH1).
