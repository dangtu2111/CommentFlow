# Handoff `feat-auto-payment-confirm` (claude, làn c)

## Đã làm
Webhook xác nhận thanh toán tự động SePay/Casso (FR-124), Xong-mock, cờ `BANK_WEBHOOK_ENABLED` TẮT, không migration. Xem `docs/plans/feat-auto-payment-confirm.md`, Q-APC1.
- `packages/connectors/src/bank/bank-webhook.ts`: xác minh khóa + parse payload.
- `packages/saas-core/src/billing/payment-reconcile.ts`: đối soát qua `ReconcileDeps`.
- `apps/web/src/server/bank-webhook.ts` + `bank-webhook-runtime.ts` + 2 route `api/webhooks/payments/{sepay,casso}`.

## Đã đọc và rút ra
- `core.confirm_invoice_payment` (0052) đã idempotent: khóa dòng hóa đơn, `bank_ref` unique, chỉ đúng tiền → `paid`.
- RLS `core.invoices` chỉ đọc trong workspace đã biết → tra theo mã chuyển khoản xuyên workspace cần hàm DEFINER mới.
- Hóa đơn không lưu mã gói/add-on → quy ước nối hóa đơn → `activatePlan`/`grantUsageAddon` chưa có.

## Còn lại
- `AUTO-PAYMENT-CONFIRM-DB` (làn b, migration): hàm tra hóa đơn theo `transfer_code` (không biết workspace) + nơi cộng lượt; rồi gán `settleStore` trong `bank-webhook-runtime.ts` (dựng trên `withJob`, `confirmInvoicePayment` — bắt 23505 → `duplicate_bank_ref`, `fulfill`).
- Chủ dự án: tài khoản SePay/Casso + khóa (`docs/can-ban-cung-cap.d/ap-fr124.md`), KT-APC; đối chiếu Casso bản webhook mới (HMAC).
