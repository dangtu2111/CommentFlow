## KT-INV — Hóa đơn + xác nhận thanh toán thủ công (INVOICES, FR-091/FR-102, Q-INV1) · Invoices store

Chưa có giao diện; kiểm bằng test. / No UI; verify with tests.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/shared exec vitest run src/invoice.test.ts`. | Xanh: tổng tiền = Σ số lượng × đơn giá; mã chuyển khoản đúng định dạng và nhận ra được trong sao kê đổi hoa/thường/chèn khoảng trắng; chỉ hóa đơn chờ + đúng số tiền mới được coi là khớp. |
| 2 | CI job `database` chạy `tests/invoices.int.test.ts` và `pnpm db:check-rls`. | Web không ghi được hóa đơn/thanh toán; chỉ job hệ thống đúng workspace ghi; Owner thấy hóa đơn của mình, Staff và workspace khác không thấy; lệch tiền không đổi trạng thái; một mã giao dịch ngân hàng không dùng hai lần. |
| 3 | (Sau khi có `QR-PAYMENT`/`ADMIN-PAYMENTS`) tạo hóa đơn, chuyển khoản thử, Admin xác nhận. | Chưa áp dụng — giao diện và đường Admin là việc sau. |
