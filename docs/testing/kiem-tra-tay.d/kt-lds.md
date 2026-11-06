## KT-LDS — Lưu khách tiềm năng (LEADS-STORE, FR-082/033, Q-LDS1) · Leads store

Chưa có giao diện; kiểm bằng test. / No UI; verify with tests.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/shared exec vitest run src/lead-contact.test.ts` và `pnpm --filter @flow/db exec vitest run src/lead-vault.test.ts src/lead-sink.test.ts`. | Xanh: chuẩn hóa SĐT/email, tối đa 3 lead/lần, mã hóa khứ hồi (sai workspace/lead/trường/khóa thì không giải mã), băm ổn định, khóa băm không trùng khóa mã hóa, cờ tắt mặc định, bật mà thiếu khóa thì báo lỗi cấu hình. |
| 2 | CI job `database` chạy `tests/leads.int.test.ts` và `pnpm db:check-rls`. | Chỉ hệ thống ghi lead; DB không chứa SĐT/email thô; trùng số không tạo lead mới; Staff đổi giai đoạn/giao người (chỉ cho thành viên đang hoạt động); Staff không xóa; workspace khác không thấy bản mã. |
| 3 | (Khi có khóa trên staging) đặt `LEADS_CAPTURE_ENABLED=true`, `LEADS_ENC_KEYS`, `LEADS_HASH_KEY` rồi chờ việc nối pipeline. | Chưa áp dụng — việc nối pipeline và giao diện Kanban là việc sau (`LEADS-KANBAN`). |
