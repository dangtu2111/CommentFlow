# Bàn giao — nhánh `feat-ai-readiness`

Cập nhật: 06/11/2026 · Mục gap matrix: AI-READINESS · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-ai-readiness.md`

## Đã làm
- `computeReadiness` (packages/ai/src/readiness) + test; `loadReadinessSource` (packages/db); trang `/app/readiness` (Owner) + i18n vi/en + mục menu; docs (Q-AR1, gap, MASTER, codemap, KT-AR).

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `kb-content.ts` / `products.ts` (schema) | `policy_items.kind`, `faq_items.tags`, `shop_profiles.contact/opening_hours`; `product_variants.attrs_norm` có khóa `size`/`color` |
| `auto-send-gate.ts` | `READINESS_MIN_PERCENT = 80`, lý do `readiness_low` |

## Còn lại
1. `AI-READINESS-PERSIST` (làn b, migration `readiness_checks`); `GET /kb/readiness` + `NOT_READY` ở `PUT /automation/settings`.
2. `pnpm test:db` cho `loadReadinessSource` (làn b).
3. `ONBOARDING-WIZARD` dùng lại `computeReadiness`.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/readiness
pnpm --filter @flow/web exec vitest run src/server/readiness.test.ts
```
