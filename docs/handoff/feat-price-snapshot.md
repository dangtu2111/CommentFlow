# Handoff `feat-price-snapshot` (claude, làn b)

## Đã làm
- Migration 0046 `cf.drafts` (đủ cột docs/10) + RLS/GRANT; `price_snapshot` bất biến (không trong GRANT UPDATE).
- `@flow/shared`: `buildPriceSnapshot`, `parsePriceSnapshot` (+test). `@flow/ai`: `priceEntriesFromSnapshot`, `priceEntriesFromSources`; R5 so thêm `variantId`.
- `@flow/db`: `insertDraft`, `getDraftPriceSnapshot`; `check-rls.ts` kỳ vọng; `tests/drafts.int.test.ts`.
- Quyết định Q-PS1 trong `docs/plans/QUYET_DINH_CHO_DUYET.md`.

## Đã đọc và rút ra
- `send-recheck.ts`: R5 chỉ so `priceVnd` + `updatedFromSourceAt` (tồn kho lưu nhưng không so). Ảnh chụp hỏng → `[]` → `price_snapshot_missing` (chặn).
- Mẫu migration/RLS: 0045 post_notes; `check-rls.ts` có 3 danh sách (cột cấm UPDATE, marker bắt buộc, marker cấm).

## Lưu ý cho PIPE-*
- Chuyển trạng thái `would_send`/`auto_sent` (và sửa dòng đã ở các trạng thái đó) phải chạy bằng `withJob`; đường người dùng bị RLS từ chối (chủ ý).

## Từ verifier-security (không chặn merge)
- Đã sửa: R5 giờ so cả tồn kho (`stock`).
- Chưa sửa (ghi lại): (1) thành viên còn UPDATE được `failed_gate`/`not_auto_sent_reason` và `final_text` của dòng đã gửi → cân nhắc tách quyền/trigger khi có `automation_events`; (2) chế độ `human` với `price: null` bỏ qua R5 → khi nối job gửi, thêm cờ `fromDraft` để bản nháp AI có số tiền mà thiếu `price` thì `price_unknown`/`ask_confirm`; (3) PIPE-*: `hasMoney` dò từ chính câu gửi, mọi số tiền phải thuộc mục có trong ảnh chụp; (4) Zod cho `NewDraft` ở ranh giới.

## Còn lại
- Phiên này KHÔNG chạy được `pnpm test:db`/`db:check-rls` (lệnh cần phê duyệt, phiên không tương tác) → CI phải chạy `tests/drafts.int.test.ts`; sửa nếu đỏ.
- Nối pipeline soạn (`buildPriceSnapshot` + `insertDraft`) và job gửi (`SEND-RECHECK-WIRE`: `getDraftPriceSnapshot` + giá hiện tại → `price` của `sendRecheck`).
