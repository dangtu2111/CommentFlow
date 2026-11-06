# Handoff `feat-price-snapshot` (claude, làn b)

## Đã làm
- Migration 0046 `cf.drafts` (đủ cột docs/10) + RLS/GRANT; `price_snapshot` bất biến (không trong GRANT UPDATE).
- `@flow/shared`: `buildPriceSnapshot`, `parsePriceSnapshot` (+test). `@flow/ai`: `priceEntriesFromSnapshot`, `priceEntriesFromSources`; R5 so thêm `variantId`.
- `@flow/db`: `insertDraft`, `getDraftPriceSnapshot`; `check-rls.ts` kỳ vọng; `tests/drafts.int.test.ts`.
- Quyết định Q-PS1 trong `docs/plans/QUYET_DINH_CHO_DUYET.md`.

## Đã đọc và rút ra
- `send-recheck.ts`: R5 chỉ so `priceVnd` + `updatedFromSourceAt` (tồn kho lưu nhưng không so). Ảnh chụp hỏng → `[]` → `price_snapshot_missing` (chặn).
- Mẫu migration/RLS: 0045 post_notes; `check-rls.ts` có 3 danh sách (cột cấm UPDATE, marker bắt buộc, marker cấm).

## Còn lại
- Phiên này KHÔNG chạy được `pnpm test:db`/`db:check-rls` (lệnh cần phê duyệt, phiên không tương tác) → CI phải chạy `tests/drafts.int.test.ts`; sửa nếu đỏ.
- Nối pipeline soạn (`buildPriceSnapshot` + `insertDraft`) và job gửi (`SEND-RECHECK-WIRE`: `getDraftPriceSnapshot` + giá hiện tại → `price` của `sendRecheck`).
