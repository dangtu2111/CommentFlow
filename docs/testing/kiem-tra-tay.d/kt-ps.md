## KT-PS — Ảnh chụp giá lúc soạn (PRICE-SNAPSHOT, FR-111, US-045) · Price snapshot

Chưa có giao diện; kiểm bằng test. / No UI; verify with tests.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/shared exec vitest run src/price-snapshot.test.ts` và `pnpm --filter @flow/ai exec vitest run src/recheck`. | Test xanh: bỏ mục không giá, loại trùng, đọc lại JSON; giá/biến thể đổi → `price_changed`, không có ảnh chụp → `price_snapshot_missing`. |
| 2 | CI job `database` chạy `tests/drafts.int.test.ts` và `pnpm db:check-rls`. | Hệ thống ghi được bản nháp + ảnh chụp; Staff/withWorkspace trần không INSERT; không ai sửa được `price_snapshot`/`text`; Staff không đặt/sửa trạng thái `auto_sent`; workspace khác không thấy. |
