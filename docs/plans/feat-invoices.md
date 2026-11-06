# Kế hoạch `feat-invoices` — INVOICES (bảng hóa đơn + thanh toán thủ công, chỉ hệ thống ghi)

Mã gap matrix: `INVOICES` (nền dữ liệu của FR-091 / ADMIN-PAYMENTS) · Spec: FR-091, FR-102, US-061; `docs/10_Database_Design.md` §3.6 (`invoices`, `payments`).

**Tóm tắt:** Tạo hai bảng `core.invoices` (hóa đơn, có nội dung chuyển khoản định danh `transfer_code`) và `core.payments` (xác nhận thanh toán tay) có RLS. Web (`cf_app`) chỉ ĐỌC (Owner của workspace); mọi ghi đi qua hàm DEFINER chỉ hệ thống (`withJob`, `cf_worker`) — đường Admin (ADMIN-SHELL) sẽ gọi cùng hàm sau. Logic quy tắc thuần ở `@flow/shared` (tính tổng, sinh/nhận diện mã chuyển khoản, đối soát số tiền) kèm property-based test. Rủi ro: thanh toán — xác nhận lệch tiền KHÔNG tự đánh dấu đã trả; chưa có giao diện/QR (QR-PAYMENT, chờ tài khoản nhận tiền).

## Điểm chưa rõ

Không có (tự chọn phương án khuyến nghị, ghi Q-INV1 trong `docs/plans/quyet-dinh/q-inv1.md`). `plans`/`subscriptions` chưa có (PLANS-SCHEMA ⛔) nên hóa đơn chưa có FK `subscription_id`; cột `items` mô tả gói.

## Tiêu chí nghiệm thu

1. Tổng tiền hóa đơn = Σ(số lượng × đơn giá) nguyên VND, từ chối mục sai/vượt trần/tổng ≤ 0; bất biến theo property-based — `packages/shared/src/invoice.test.ts`.
2. Mã chuyển khoản sinh đúng định dạng (tiền tố theo sản phẩm + 8 ký tự không nhầm lẫn), nhận diện được trong nội dung sao kê bị đổi hoa/thường/chèn khoảng trắng-gạch — cùng test.
3. Đối soát: đúng số tiền & hóa đơn `pending` → `ok`; lệch tiền → `amount_mismatch`; đã trả → `already_paid`; hủy → `void` — cùng test.
4. `core.invoices`/`core.payments`: CHECK (product, status, số tiền > 0, number/transfer_code định dạng, items là mảng), unique (number, transfer_code, bank_ref, 1 payment/hóa đơn) — `packages/db/tests/invoices.int.test.ts`.
5. RLS: `cf_app` KHÔNG có quyền ghi bất kỳ cột nào; Owner đọc hóa đơn/payments của workspace mình; Staff và workspace khác không thấy; `withWorkspace` (không người dùng) đọc được; hàm ghi chỉ chạy được từ `withJob` đúng workspace trên `cf_worker` — cùng test + `pnpm db:check-rls`.
6. Hàm: tạo hóa đơn `pending`; xác nhận đúng tiền → `paid` + một dòng payment; lệch tiền → không đổi; gọi lại cùng `bank_ref` → idempotent; hóa đơn đã `void` không xác nhận được; hủy chỉ hóa đơn `pending` — cùng int test.
7. lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, coverage `packages/shared`, `CF_LANE=b pnpm test:db`, precheck.

## File sẽ đọc

`docs/10` §3.6 (đã đọc), `packages/db/migrations/0039_usage_counters.sql` + `src/usage-counters.ts` + `src/check-rls.ts` (mẫu hàm DEFINER chỉ `cf_worker`), `packages/shared/src/usage.ts` (mẫu), `packages/db/tests/helpers.ts`.

## File sẽ sửa / tạo

- `packages/shared/src/invoice.ts` (+test) + `index.ts` — logic thuần.
- `packages/db/src/schema/core/invoices.ts` + `index.ts`; migration `0052_invoices.sql` + `meta/*`.
- `packages/db/src/invoices.ts` (hàm gọi DEFINER + đọc) + `runtime.ts` (xuất).
- `packages/db/src/check-rls.ts` — kỳ vọng RLS, cột cấm ghi, hàm cho `cf_worker`.
- `packages/db/tests/invoices.int.test.ts`.
- `docs/10`, `docs/codemap.d/*`, `docs/plans/quyet-dinh/q-inv1.md`, `docs/gap-matrix.md`/`MASTER.md` (dòng INVOICES), `docs/testing/kiem-tra-tay.d/*`, `docs/handoff/feat-invoices.md`.

## Migration

`0052_invoices` (fetch origin trước khi đặt số: sau 0051). Tạo `core.invoices`, `core.payments`, sequence số hóa đơn, 3 hàm DEFINER (`core.create_invoice`, `core.confirm_invoice_payment`, `core.void_invoice`). Đường lùi: DROP 3 hàm, 2 bảng, sequence; bỏ kỳ vọng check-rls. Chưa có nơi gọi trong runtime nên triển khai không cần phối hợp.

## Test viết trước

Unit shared viết trước (đỏ). Int test RLS/hàm viết cùng migration trước khi viết lớp truy vấn.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/invoice.test.ts`; `CF_LANE=b pnpm test:db` (invoices); `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration + RLS) và `verifier-security` (thanh toán, ghi chỉ hệ thống).

## Rủi ro / câu hỏi cho chủ dự án

Đường Admin xác nhận (ADMIN-PAYMENTS) cần phiên Admin (ADMIN-SHELL): hiện chỉ `cf_worker` gọi được hàm ghi; Admin sẽ thêm hàm bao riêng khi có role Admin.

## Đề xuất thay đổi

Cập nhật docs/10 `invoices`/`payments` theo thực tế 0052 (ghi ở Q-INV1).

## Complexity tracking

Không có

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới": không policy ghi cho `cf_app`; ghi chỉ qua hàm DEFINER cho `withJob`; đọc Owner hoặc không người dùng

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR; Q-INV1).
