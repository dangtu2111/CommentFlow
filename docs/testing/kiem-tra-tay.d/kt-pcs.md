## KT-PCS — Semantic cache LiteLLM (stub) (PIPE-CACHE-SEMANTIC-STUB, FR-026) · Semantic cache stub

Chưa có giao diện; kiểm bằng test. / No UI; verify with tests.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/cache/semantic-cache.test.ts`. | Test xanh: cờ tắt → no-cache/no-store; bật → namespace chứa workspace_id + kb_version; hai shop không chung namespace. |
| 2 | Mở `infra/litellm/semantic-cache.example.yaml`. | Chỉ là file mẫu (không nằm trong `config.yaml`); không có khóa/giá trị thật. |
