# Bàn giao — nhánh `feat-da-rules-price`

Cập nhật: 06/11/2026 · Mục gap matrix: DA-RULES-PRICE · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-da-rules-price.md`

## Đã làm
- `packages/ai/src/rules/price-rules.ts` (+ test TDD/property-based): `checkCaptionPrices`, `checkCustomerQuotedPrice`, `evaluatePriceRisk`, `buildPriceQuote`, `extractPriceAmounts`; export ở `index.ts`; ngưỡng 95% nhánh `src/rules/*.ts`.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `decide/decide-action.ts` | Đầu vào cần `risks.priceConflict` (bắt buộc đủ cờ) và `products.missingAxes`; cờ giá bật → `handoff` `price_conflict`. |
| `guard-money.ts` | `extractClaims` khóa tiền dạng `vnd:<đồng>`; dùng lại để một định nghĩa "số tiền". |

## Quyết định đã chốt trong phiên
- Q-DRP1 (`QUYET_DINH_CHO_DUYET.md`).

## Còn lại (theo thứ tự)
1. `DA-RULES-PRICE-DB` (làn b): bảng `post_price_mentions` + `GET /posts/:id/price-mentions`, tính khi bài đồng bộ/giá đổi.
2. Nối pipeline: cấp giá kho các biến thể, `risks.priceConflict`/`missingAxes` cho `decideAction`, `knownPricesVnd` (cả min/max) cho guard; đưa khoảng giá vào `ActionBrief` (đổi prompt → bump `prompt_version`).
3. Cảnh báo Owner "Giá quảng cáo khác giá kho" ở UI; `PRICE-QUOTE-MENTION`.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/rules
pnpm --filter @flow/ai test:coverage
```

Verifier-security (một lần): chặn merge đã sửa — kho chưa có giá mà có số tiền được nhắc → `evaluatePriceRisk` chuyển người (đóng khi lỗi); khoảng giá không có trục để hỏi → `none` (`variant_unresolvable`). Mục còn lại ghi ở gap matrix.
