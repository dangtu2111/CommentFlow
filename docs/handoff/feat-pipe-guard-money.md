# Bàn giao `feat-pipe-guard-money` (claude, làn c)

**Đã làm:** `PIPE-GUARD-MONEY` (FR-030): `packages/ai/src/guard-money.ts` (`extractClaims`, `checkGuardMoney`) + test ví dụ/ca biên/fast-check (`guard-money.test.ts`); ngưỡng ≥95% nhánh theo file ở `packages/ai/vitest.config.ts` (đo 95,7%); devDependency `fast-check` 4.10.2 (MIT, đã dùng ở web/connectors). Quyết định: Q-PGM1.
**Đã đọc, rút ra:** `packages/ai` chỉ có `llm-client`; PIPE-DRAFT chưa làm nên chưa nối guard. Không cần LLM/embedding (hàm thuần).
**Còn lại:** nối `checkGuardMoney` vào PIPE-DRAFT/PIPE-CONFIDENCE (vi phạm → `needs_human`, §6 mục 6) và truyền `knownPricesVnd` từ `products` (PRICE-SNAPSHOT). Không có tài nguyên ngoài → không thêm vào CAN_BAN_CUNG_CAP.
