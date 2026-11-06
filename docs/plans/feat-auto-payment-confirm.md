# Kế hoạch `feat-auto-payment-confirm` — Xác nhận thanh toán tự động (SePay/Casso)

## Việc

Mã gap matrix: `AUTO-PAYMENT-CONFIRM` · Spec: docs/05 FR-124, docs/10 §3.6 (hóa đơn/thanh toán), QR-PAYMENT (Q-QRP1).

**Tóm tắt:** Khi khách chuyển khoản đúng nội dung `CF…`/`XF…` của hóa đơn, dịch vụ đọc giao dịch ngân hàng (SePay hoặc Casso) gọi webhook (địa chỉ nhận tin tự động) về hệ thống. Code xác minh khóa của nhà cung cấp, khớp nội dung với hóa đơn, chỉ đánh dấu đã trả khi ĐÚNG số tiền, chống xử lý trùng rồi cộng lượt AI. Làm bằng mock/fixture, cờ `BANK_WEBHOOK_ENABLED` TẮT. Rủi ro: tiền thật nên mọi nhánh lỗi phải đóng (không xác nhận khi nghi ngờ); phần tra hóa đơn xuyên workspace cần migration của làn b nên chưa nối DB (route trả 503).

## Điểm chưa rõ

Không có. (Tự chọn phương án an toàn, ghi ở Q-APC1.)

## Tiêu chí nghiệm thu

1. Khóa/token webhook sai hoặc thiếu → 401, không đối soát; cờ tắt hoặc thiếu khóa cấu hình → 503 — kiểm bằng `apps/web/src/server/bank-webhook.test.ts`, `packages/connectors/src/bank/bank-webhook.test.ts`.
2. Payload SePay/Casso được chuẩn hóa; tiền ra, số tiền sai, dòng hỏng bị bỏ qua — `bank-webhook.test.ts` (connectors).
3. Đúng mã + đúng tiền → xác nhận + cộng lượt đúng một lần; lệch tiền/đã trả/đã hủy/mã mơ hồ/sai tài khoản → không xác nhận, không cộng lượt — `payment-reconcile.test.ts`.
4. Gửi lại (idempotent): lần sau không cộng lượt lần hai (hóa đơn paid, DB trả `already_paid`, `bank_ref` trùng) — `payment-reconcile.test.ts`.
5. Lỗi hạ tầng/cộng lượt → 500 để nhà cung cấp gửi lại; log chỉ có tên kết quả, không nội dung sao kê — `bank-webhook.test.ts` (web).
6. Không migration, không sửa `.gitleaks.toml`; `pnpm precheck` xanh.

## File sẽ đọc

`docs/gap-matrix.md` (dòng QR-PAYMENT), `packages/shared/src/invoice.ts`, `packages/db/src/invoices.ts`, `packages/db/migrations/0052_invoices.sql` (hàm xác nhận), `packages/db/src/plans.ts`, `apps/web/src/server/meta-webhook.ts`, `apps/web/src/server/webhook-runtime.ts`.

## File sẽ sửa / tạo

- `packages/connectors/src/bank/bank-webhook.ts` (+test), `index.ts` — xác minh khóa + parse SePay/Casso.
- `packages/saas-core/src/billing/payment-reconcile.ts` (+test), `index.ts` — đối soát thuần qua cổng (port).
- `apps/web/src/server/bank-webhook.ts` (+test), `bank-webhook-runtime.ts`, hai route `api/webhooks/payments/{sepay,casso}/route.ts`; `meta-webhook.ts` chỉ thêm `export` cho `readCapped`.
- `env.example`, docs: quyết định Q-APC1, CBCC, KT, codemap, gap matrix, MASTER, handoff.

## Migration

Không có (làn c). Phần cần migration ghi gap `AUTO-PAYMENT-CONFIRM-DB` cho làn b: hàm DEFINER tra hóa đơn theo mã chuyển khoản không biết workspace + hàm cộng lượt theo hóa đơn.

## Test viết trước

Đối soát (`payment-reconcile.test.ts`): mỗi nhánh kết quả một test, ca biên ±1 đồng. Xác minh khóa: ca rỗng/sai tiền tố.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/bank` · `pnpm --filter @flow/saas-core exec vitest run src/billing/payment-reconcile` · `pnpm --filter @flow/web exec vitest run src/server/bank-webhook`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (chữ ký/khóa webhook, thanh toán).

## Rủi ro / câu hỏi cho chủ dự án

Cần tài khoản SePay/Casso + khóa (docs/can-ban-cung-cap.d/ap-fr124.md); đối chiếu lại định dạng tiêu đề/payload với tài liệu hiện hành của nhà cung cấp khi có tài khoản thật.

## Đề xuất thay đổi

Không sửa docs/01–16.

## Complexity tracking

Không có (không thư viện mới; cổng `ReconcileDeps` có ≥ 2 nơi dùng: web + test, và connector nền tảng thuộc ngoại lệ).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi ở Q-APC1).
