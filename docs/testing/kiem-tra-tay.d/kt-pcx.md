## KT-PCX — Cache khớp chính xác (PIPE-CACHE-EXACT, FR-026/135) · Exact cache

Chưa có giao diện; kiểm bằng test. / No UI; verify with tests.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/cache`. | 19 test xanh: khóa chứa workspace_id, đổi giá (rev lệch) → không trả giá cũ, cờ tắt → không dùng cache. |
| 2 | CI job `database` chạy `tests/kb-version.int.test.ts`. | `getCurrentKbVersion` trả 0 / số lớn nhất, không lộ workspace khác. |
