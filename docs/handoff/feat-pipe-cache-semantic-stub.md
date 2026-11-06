# Bàn giao — nhánh `feat-pipe-cache-semantic-stub`

Cập nhật: 2026-11-06 · Mục gap matrix: PIPE-CACHE-SEMANTIC-STUB · Agent vừa làm: claude · Kế hoạch: `docs/plans/feat-pipe-cache-semantic-stub.md` · Quyết định: Q-PCS1

## Đã làm
- `packages/ai/src/cache/semantic-cache.ts` (+ test, viết trước): `buildSemanticCacheControl`, `isSemanticCacheEnabled`; export ở `packages/ai/src/index.ts`.
- `infra/litellm/semantic-cache.example.yaml` (mẫu, không nạp); `env.example` thêm `CACHE_SEMANTIC_ENABLED`.
- Không migration. Docs: CAN_BAN_CUNG_CAP §2s, KT-PCS, codemap, gap-matrix, MASTER.

## Đã đọc và rút ra
- `infra/litellm/config.yaml` đã bật cache Redis chính xác toàn cục (không theo workspace) — cần cân nhắc ở `SEMANTIC-CACHE`/PIPE-ORCHESTRATOR: truyền `cache` per-request.
- `llm-client.ts` chưa có trường truyền `cache` vào body.

## Còn lại (→ `SEMANTIC-CACHE`, GĐ5)
Truyền `cache` qua `llm-client`, loại câu có số tiền + so `product_revs`, đo tỉ lệ trúng, Redis Stack + model embedding.
