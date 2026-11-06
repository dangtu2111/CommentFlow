# Handoff `feat-ai-virtualkey` — AI-VIRTUALKEY (FR-034)

Agent vừa làm: claude (làn d).

## Đã làm

- Module `packages/ai/src/virtual-key/` (config, admin HTTP + mock, store bộ nhớ, resolver, caller) + test (property-based, đua, đóng khi lỗi). Cờ `LITELLM_VIRTUAL_KEYS_ENABLED` tắt. Quyết định Q-AVK1.
- Docs file riêng: plan, `qavk1.md`, `ai-virtualkey.md` (CAN_BAN_CUNG_CAP), `kt-avk`/`tt-avk`, codemap.d; gap-matrix + MASTER cập nhật dòng AI-VIRTUALKEY.

## Đã đọc và rút ra

- `llm-client.ts`: `apiKey` tĩnh, 401/403 → `CONFIG_INVALID`; 400 budget-exceeded của LiteLLM hiện thành `LLM_UNAVAILABLE` (chưa ánh xạ sang `COST_CAP_REACHED`).
- `cost-gate/ledger.ts`: `CostLedger.read` → `capUsd` (null = không trần); dùng lại làm nguồn ngân sách khóa.
- `usage_counters` đếm LƯỢT, không đổi ra đô → không ánh xạ trực tiếp.

## Còn lại

- `AI-VIRTUALKEY-DB` (làn b, migration): bảng lưu khóa ảo mã hóa + `VirtualKeyStore` bản DB.
- Nối nơi dựng client (`createVirtualKeyLlmCaller` bọc trong `createCostGatedLlmClient`), đọc env `LITELLM_MASTER_KEY`.
- Ánh xạ lỗi vượt ngân sách LiteLLM → `COST_CAP_REACHED` (sửa `llm-client`).
- Cần master key thật (CAN_BAN_CUNG_CAP).
