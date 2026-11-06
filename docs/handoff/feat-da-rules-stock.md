# Bàn giao — nhánh `feat-da-rules-stock`

Cập nhật: 2026-11-06 · Mục gap matrix: DA-RULES-STOCK · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-da-rules-stock.md`

## Đã làm
- `packages/ai/src/decide/stock-rules.ts`: `evaluateStockRules` (độ tươi + ngưng/hết hàng + gợi ý ≤ 2), `anyStockStale`; test + property-based; nhánh 98%.
- Docs: Q-DRS1, gap matrix, MASTER, codemap, KT-DRS, CAN_BAN_CUNG_CAP.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `decide/decide-action.ts` | `risks.stockStale` đã có sẵn → redirect `stock_stale` + mẫu `stock_check`; `try-pipeline.ts` đang truyền `false` |
| `schema/cf/products.ts` | `products.source/status/updated_from_source_at`, `product_variants.stock/status/price_vnd` đủ cho hàm thuần |

## Còn lại
- `DA-RULES-STOCK-WIRE` (làn b/nối pipeline): `automation_settings.stock_stale_days`/`suggest_alternatives` (bảng chưa có), cấp `syncError`, nối `try-pipeline`/pipeline thật, đưa `alternatives` vào prompt soạn.
