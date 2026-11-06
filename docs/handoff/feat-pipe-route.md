# Bàn giao — nhánh `feat-pipe-route`

Cập nhật: 2026-11-06 · Mục gap matrix: PIPE-ROUTE · Agent vừa làm: claude · Commit cuối: xem `git log -1`
Kế hoạch: `docs/plans/feat-pipe-route.md`

## Đã làm
- `packages/ai/src/route/route-topics.ts`: `classifyAsk` (từ khóa đã bỏ dấu; ý "khác" — ship/đổi trả/bảo hành/lạ — kiểm trước nên "ship về Cà Mau bao nhiêu" không bị nhận là giá/màu).
- `route.ts`: `routeQuery({extract, resolvedProductIds})` → `{route, reason}`; `sql` ⇔ có sản phẩm + ý giá/mua/size/màu/tồn + không ý khác (kể cả `order_intent.address`); chưa nhận sản phẩm → `both`; khiếu nại/spam hoặc không ý SQL → `hybrid`.
- `execute-route.ts`: `executeRoute` (sql không gọi hybrid; both song song).
- `sql-lookup.ts`: `wantedAttrs` (qua `normalizeAttrs`), `lookupVariantsForRoute`, `createDbVariantLookup` (bọc `findActiveVariants`).
- Test TDD + property-based (fast-check); ngưỡng nhánh 95% theo file `src/route/*.ts`; Q-PR1, KT-PR, gap matrix, MASTER, codemap.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `classify/extract-result.ts` | `ExtractResult` có `labels[]`, `size`, `color`, `asks[]`, `order_intent{items,phone,address}` — `route` chỉ đọc 5 trường này |
| `packages/db/src/queries/products.ts` | `findActiveVariants(tx, ws, productIds, wanted)`; `wanted` đã `normalizeAttrs` (chữ thường: size `M`→`m`) |

## Còn lại (việc khác)
1. PIPE-RETRIEVE: cấp `resolvedProductIds`, gọi `routeQuery` + `executeRoute`, thêm "ghi chú bài" vào nhánh `sql`.
2. Ghi `retrieval_logs.route` — chờ bảng `retrieval_logs` (migration làn b / KB-SEARCH-FTS).
3. AI-EVAL: hiệu chỉnh từ khóa "ý khác" bằng bình luận thật đã che PII.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/route
pnpm --filter @flow/ai test:coverage
```
