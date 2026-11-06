# Bàn giao — nhánh `feat-pipe-classify-extract`

Cập nhật: 06/11/2026 · Mục gap matrix: PIPE-CLASSIFY-EXTRACT · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-pipe-classify-extract.md`

## Đã làm
- `packages/ai/src/classify/`: schema Zod `extract` (FR-162) + chuẩn hóa `labels[]` (FR-145), `Extractor`, `createLlmExtractor` (một lần gọi, step `extract`, `extract@1`), cờ `CLASSIFY_LLM_ENABLED` (tắt), mock `createFixtureExtractor`; test + coverage `packages/ai` vẫn đạt ngưỡng.
- Tài liệu: `env.example`, `CAN_BAN_CUNG_CAP` §2e, `KIEM_TRA_TAY` KT-030, Q-PCE1, MASTER/gap/codemap.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `packages/ai/src/llm-client.ts` | `call()` nhận `MaskedText`, ghi `ai_usage`; lỗi `LLM_UNAVAILABLE`; `ExtractInput` nằm ở `extract-prompt.ts` (tránh vòng phụ thuộc với `extractor.ts`) |

## Còn lại (theo thứ tự)
1. Nối vào pipeline (PIPE-ROUTE…): chọn `createLlmExtractor` khi `loadClassifyConfig(env).enabled`, ghi `comments.label/labels/label_source`, `drafts.extracted`.
2. PII-MASK-PIPE: điền `order_intent.phone` từ số trước khi che.
3. Bộ phân loại ml tự host (FR-027 "ml trước"); chất lượng prompt đo ở EVAL-RUNNER.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/classify
pnpm --filter @flow/ai test:coverage
```
