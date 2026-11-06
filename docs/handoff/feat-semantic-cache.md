# Handoff `feat-semantic-cache` (claude, làn c)

## Đã làm
- `packages/ai/src/cache/semantic-lookup.ts`: semantic cache qua `SemanticStore` + `Embedder` (mock), TDD + property-based; `findUncacheableReason` tách từ `exact-cache.ts` (luật ghi dùng chung).
- Docs bằng file riêng: Q-SC1, CBCC §2t, KT-SC/tt-sc, codemap.d; dòng gap-matrix/MASTER.

## Đã đọc và rút ra
- `exact-cache.ts` (khóa/luật ghi), `semantic-cache.ts` (control LiteLLM — giữ nguyên), `embedding/*` (Embedder `embed(texts[])`; mock trigram chỉ giống ký tự, nên test dùng ngưỡng thấp ở ca "gần giống").

## Còn lại
- `SemanticStore` Redis Stack thật, nối orchestrator, embedding thật + ghi `ai_usage` cho lần embed, chỉnh ngưỡng; không migration trong làn này.
- `nearest` chỉ trả top-1: câu khác ngôn ngữ/số có thể che mục đúng hơn (chỉ làm trượt, không sai); cân nhắc top-K khi nối Redis.
