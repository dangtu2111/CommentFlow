## KT-PN — Ghi chú theo bài có hạn (POST-NOTES, FR-062, US-033) · Post notes

Chưa có giao diện; kiểm bằng test. / No UI; verify with tests.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/shared exec vitest run src/post-notes.test.ts`. | Test xanh: nội dung chuẩn hóa, hạn phải sau ngày bắt đầu, đúng biên hết hạn, ghi đè chỉ nhận `off`/`shadow`, `effectiveAutoMode` không bao giờ nâng chế độ. |
| 2 | CI job `database` chạy `tests/post-notes.int.test.ts` và `pnpm db:check-rls`. | Owner ghi được, Staff chỉ đọc, workspace khác không thấy; ghi chú hết hạn không được trả; DB từ chối ghi đè `auto`; xóa bài xóa luôn ghi chú. |
