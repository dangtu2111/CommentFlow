# Kế hoạch `feat-qr-payment` — QR chuyển khoản + trạng thái chờ xác nhận

## Việc

Mã gap matrix: `QR-PAYMENT` · Spec: FR-091 (docs/05), US-061 (docs/04), UF-9 (docs/07), docs/10 §3.6, docs/12 (thanh toán).

**Tóm tắt (2–3 câu):** Owner xem hóa đơn đang chờ trả, thấy mã QR chuyển khoản (chuẩn VietQR — mã QR mà app ngân hàng quét được và tự điền số tiền + nội dung) cùng nội dung chuyển khoản định danh, bấm "Tôi đã chuyển khoản" để hóa đơn sang trạng thái "chờ xác nhận"; hóa đơn chỉ thành "đã trả" khi Admin/hệ thống xác nhận (đã có từ `INVOICES`). Tài khoản nhận tiền là tài nguyên ngoài (chưa có) nên đọc từ biến môi trường sau cờ `QR_PAYMENT_ENABLED` mặc định TẮT; test dùng tài khoản fixture. Rủi ro: QR sai số tiền/nội dung làm khách chuyển nhầm → số tiền và mã luôn lấy từ hóa đơn trong DB, payload có test + CRC.

## Điểm chưa rõ

Không có (mọi chỗ mơ hồ đã tự chọn phương án an toàn, ghi ở `docs/plans/quyet-dinh/qqrp1.md`).

## Tiêu chí nghiệm thu

1. Chuỗi VietQR đúng cấu trúc EMVCo: trường 00/01/38/53/54/58/62/63, CRC16-CCITT khớp vector chuẩn `123456789 → 29B1`, số tiền nguyên VND, nội dung = mã chuyển khoản — kiểm bằng `packages/shared/src/vietqr.test.ts`.
2. Số tiền ≤ 0/không nguyên/quá trần, mã chuyển khoản sai dạng, cấu hình tài khoản sai bị từ chối — cùng file test.
3. Owner báo chuyển khoản: hóa đơn `pending` có `transfer_reported_at`, vẫn `pending`; lần hai idempotent; đã trả/đã hủy không đổi; ghi `action_logs` — `packages/db/tests/invoices.int.test.ts` (`pnpm test:db`).
4. Chỉ Owner của đúng workspace báo được: Staff → 42501, workspace khác → P0002, không người dùng/job hệ thống → 42501, `cf_app` không UPDATE trực tiếp — cùng test tích hợp + `pnpm db:check-rls` (qua `check-rls.int.test.ts`).
5. Cờ `QR_PAYMENT_ENABLED` TẮT (mặc định) hoặc thiếu cấu hình tài khoản → không dựng QR, giao diện nói "Sắp có", Server Action từ chối; cờ BẬT + cấu hình đủ → có QR và nội dung chuyển khoản — `apps/web/src/server/invoice-payment.test.ts`.
6. Hóa đơn của workspace khác/Staff không xem được hướng dẫn thanh toán (404/từ chối) — cùng test.
7. Chuỗi giao diện `vi`/`en` khớp khóa, không viết cứng — `pnpm lint:i18n` + test khớp khóa hiện có.

## File sẽ đọc (≤ ~8)

`packages/shared/src/invoice.ts` (mã chuyển khoản, trần tiền) · `packages/db/migrations/0052_invoices.sql`, `0055_workspace_deletion.sql` (mẫu hàm DEFINER Owner) · `packages/db/src/invoices.ts` · `packages/db/src/check-rls.ts` (khối Owner function) · `apps/web/src/app/app/(guarded)/settings/billing/page.tsx`, `components/settings/billing-view.tsx` · `packages/saas-core/src/auth/two-factor.ts` (cách dùng `qrcode`).

## File sẽ sửa / tạo

- `packages/shared/src/vietqr.ts` (+test) — dựng payload VietQR, CRC, kiểm cấu hình tài khoản nhận; export ở `index.ts`.
- `packages/db/migrations/0057_qr_payment.sql` (+ snapshot/journal) · `schema/core/invoices.ts` — cột `transfer_reported_at` + hàm `core.report_invoice_transfer`.
- `packages/db/src/{invoices,runtime,check-rls}.ts`, `tests/invoices.int.test.ts` — `reportInvoiceTransfer`, kiểm quyền hàm.
- `packages/saas-core/src/billing/payment-qr.ts` (+test) — vẽ chuỗi payload thành SVG bằng `qrcode` sẵn có (không gọi dịch vụ ngoài).
- `apps/web/src/server/invoice-payment.ts` (+test) — nhà cung cấp tài khoản nhận (interface + env + fixture), nạp hướng dẫn thanh toán, báo chuyển khoản.
- `apps/web/src/server/env.ts`/`env.example` — tên biến (không giá trị).
- `apps/web/src/app/app/(guarded)/settings/billing/{page.tsx,actions.ts}`, `components/settings/{billing-view,payment-qr-card}.tsx`, `lib/billing-view.ts`, i18n `vi.json`/`en.json`.
- Tài liệu: `docs/plans/quyet-dinh/qqrp1.md`, `docs/can-ban-cung-cap.d/qr-payment.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-qrp.md`, `docs/codemap.d/*`, gap-matrix/MASTER (dòng của việc), handoff.

## Migration

`0057_qr_payment.sql` (làn b): `ALTER TABLE core.invoices ADD COLUMN transfer_reported_at timestamptz` + hàm `core.report_invoice_transfer(workspace, invoice)` SECURITY DEFINER đường Owner (mẫu 0055): người dùng từ `current_user_id()`, workspace khớp, không phải hệ thống, `is_workspace_owner()`; khóa dòng; idempotent; ghi `action_logs`. EXECUTE chỉ `cf_app`. Đường lùi: DROP FUNCTION + DROP COLUMN (xem đầu file migration). Không bảng mới.

## Test viết trước

`vietqr.test.ts` (CRC, payload, ca biên số tiền/mã/cấu hình), `invoices.int.test.ts` khối "báo chuyển khoản" (ca đua 3 lần bấm đồng thời), `invoice-payment.test.ts` (cờ/cấu hình/vai trò).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared test` · `pnpm --filter @flow/saas-core test` · `pnpm --filter @flow/web test` · `pnpm test:db` · `pnpm --filter @flow/shared test:coverage`, `pnpm --filter @flow/saas-core test:coverage`.

## Cần kiểm chứng độc lập không?

Có: `verifier-db` (migration + hàm DEFINER) và `verifier-security` (thanh toán, quyền Owner, số tiền) — một lần ở cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

- Cần tài khoản ngân hàng nhận tiền thật (BIN, số TK, tên) — mục `docs/can-ban-cung-cap.d/qr-payment.md`; chưa có thì cờ TẮT.
- "Tôi đã chuyển khoản" là lời khai của khách, không phải bằng chứng; chỉ Admin/đối soát mới chuyển `paid` (`ADMIN-PAYMENTS`, `AUTO-PAYMENT-CONFIRM`).

## Đề xuất thay đổi

Không đổi docs/01–16.

## Complexity tracking

Không có. (`qrcode` đã là phụ thuộc của saas-core; không thêm thư viện. Interface nhà cung cấp tài khoản nhận có 2 cài đặt thật: env và fixture.)

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — không có bảng mới; hàm ghi mới theo vai trò Owner (`withActor`)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi ở Q-QRP1).
