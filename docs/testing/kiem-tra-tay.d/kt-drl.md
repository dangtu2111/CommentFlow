## KT-DRL — Cam kết pháp lý/uy tín (DA-RULES-LEGAL, FR-160) · Legal/trust commitments

Chưa có giao diện (lõi hàm thuần, chưa nối pipeline). / No UI yet (pure core, not wired).

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/decide/legal-rules.test.ts` | Xanh: hỏi chính hãng/VAT/bảo hành/nguồn gốc/hoàn tiền mà kho không nhắc → cờ `legalUnsourced`; nháp khẳng định không nguồn hoặc thời hạn lạ → bị chặn. |
