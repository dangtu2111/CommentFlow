# Handoff feat-cli-parseenv (claude, làn a)

**Đã làm:** `packages/db/src/cli-env.ts` (+ test) gồm `parseAdminCliEnv`/`parseTestResetEnv`/`parseCheckRlsEnv`/`parseStagingCliEnv` (qua `parseEnv`); 4 CLI db + 2 CLI worker dùng chúng, không còn `process.env` thô. Hành vi giữ nguyên (biến thiếu vẫn do guard báo lỗi).

**Đã đọc, rút ra:** guard nhận `undefined` nên schema để biến optional; `StagingMigrateEnv` giữ làm kiểu trả về.

**Còn lại:** không. `scripts/*.mjs` (webhook-send, e2e…) ngoài phạm vi (không phải CLI trong packages).
