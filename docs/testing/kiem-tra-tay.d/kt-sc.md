## KT-SC — Semantic cache đầy đủ (SEMANTIC-CACHE, FR-026) · Semantic cache

Chưa có giao diện; kiểm bằng test. / No UI; verify with tests.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/cache/semantic-lookup.test.ts`. | Test xanh: khóa có workspace/bài/kb_version; dưới ngưỡng → miss; câu có giá/dữ liệu sản phẩm không được ghi; khác số/ngôn ngữ → miss; cờ tắt → không gọi embed. |
