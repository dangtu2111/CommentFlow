# Bàn giao `feat-pipe-draft` (PIPE-DRAFT) — claude

## Đã làm
- `packages/ai/src/draft/*`: `draft-result` (Zod + `enforceClaimSources`), `draft-prompt` (3 khối, `cache`, thẻ nguồn, xưng hô), `drafter` (interface + LLM một lần, không nguồn đạt ngưỡng 0.35 → không gọi LLM), `draft-config` (cờ tắt), `fixture-drafter`.
- `llm-client.ts`: `LlmMessage.cache` → khối `cache_control: ephemeral` (FR-138).
- Q-PD1, KT-031, `CAN_BAN_CUNG_CAP` §2f, `env.example` (`DRAFT_LLM_ENABLED/MODEL`).

## File đã đọc + điều rút ra
- `classify/*` là mẫu (interface + LLM + fixture + cờ). `llm-client` nhận `MaskedText`; `ai_usage` ghi sẵn `cachedTokens`.
- Ngưỡng coverage `packages/ai` 100% dòng — giữ.

## Còn lại (việc khác)
- PIPE-RETRIEVE cấp `DraftSource[]` (+ điểm liên quan); PIPE-GUARD-MONEY: số tiền/link/SĐT/xưng hô; PIPE-VARIATION: `variants[]`.
- Ghi `drafts.claims/sources/unanswered_topics` + `kb_gaps` khi nối pipeline.
- Đo tỉ lệ cache ≥ 50% và chất lượng khi có khóa (EVAL-RUNNER).
