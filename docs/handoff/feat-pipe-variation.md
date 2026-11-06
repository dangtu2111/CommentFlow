# Bàn giao `feat-pipe-variation` (PIPE-VARIATION, FR-161) — agent: claude

## Đã làm
- `packages/ai/src/variation/variation.ts`: `replyFingerprint`, `guardVariants`, `pickVariant`, `MAX_VARIANTS=5`, `REASON_VARIANTS_EXHAUSTED`.
- `draft-result.ts`: trường `variants` (mặc định `[]`); `draft-prompt.ts`: hướng dẫn biến thể; `drafter.ts`: nhiệt độ 0,3, `draft@2`, `maxTokens` 1200, lọc biến thể bằng `guardVariants`.
- Quyết định: Q-PV1. Plan: `docs/plans/feat-pipe-variation.md`. Không migration.

## Đã đọc + rút ra
- `Drafter.draft` trả `DraftResult`; `needs_human` thì `variants=[]`. `checkGuardMoney` nhận `sources: string[]` (chữ).
- Biến thể hợp lệ phải có CÙNG tập khẳng định (`extractClaims` kind|key) với câu gốc.
- `pnpm --filter @flow/ai test:coverage` có một lần đỏ ngẫu nhiên (không tái hiện, 2 lần sau xanh).

## Còn lại
- **VARIATION-WIRE**: Redis `cf:{ws}:post:{id}:recent` (TTL 1 giờ, lưu `replyFingerprint`), gọi `pickVariant` khi gửi, ghi `drafts.variants`/`chosen_variant`; hết biến thể → Chờ duyệt hoặc soạn lại (`REASON_VARIANTS_EXHAUSTED`).
- **VARIATION-NAME**: chèn tên khách khi `address_by_name` (cần `brand_voice`, làn b).
- Chỉnh nhiệt độ theo EVAL-RUNNER; xưng hô trong biến thể thuộc guard xưng hô (PIPE-GUARD-MONEY).
