# Kế hoạch `feat-polling-backfill` — POLLING-BACKFILL (FR-023) + FB-BACKFILL (FR-011) + FB-FETCH-PAGE-WIDE

Mã gap matrix: `POLLING-BACKFILL`, `FB-BACKFILL`, `FB-FETCH-PAGE-WIDE`, phần "webhook im lặng" của `BANNERS-OTHER` · Spec: docs/05 FR-011, FR-023; docs/12 §1; docs/08 §3; ADR 010 §3.

**Tóm tắt:** Webhook của Meta có thể rớt tin. Ta thêm "job quét bù" (polling = hỏi Meta định kỳ): với mỗi Page, lấy một số bài mới nhất, đọc bình luận của bài có hoạt động trong 7 ngày qua, rồi đưa vào ĐÚNG đường ingest hiện có (ghi `webhook_events` + job `ingest`), nên trùng với webhook thì tự bỏ qua. Cùng lõi này dùng cho "lấy bình luận cũ 3/7/30 ngày khi kết nối". Nếu quét bù thấy bình luận mà webhook chưa từng báo → hiện banner "webhook im lặng" cho Owner. Chạy bằng connector giả/fixture; cờ gọi Meta thật mặc định TẮT. Rủi ro: chưa liệt kê được kênh xuyên workspace nếu không có migration (làn b).

## Điểm chưa rõ

Không có (đã tự chọn phương án khuyến nghị, ghi `QUYET_DINH_CHO_DUYET.md` QP1–QP5).

## Tiêu chí nghiệm thu

1. Connector Facebook `fetchComments(channel, since)` quét tối đa N bài mới nhất của Page (`/{page}/feed`), chỉ đọc bình luận của bài có `updated_time ≥ since`, lọc bình luận `created_time ≥ since`; không vượt trần bài; lỗi chỉ là mã — kiểm bằng `connector.test.ts` (FR-023).
2. Cửa sổ quét thuần: lần đầu = 7 ngày; các lần sau = `last_polled_at` trừ phần chồng 15 phút, không bao giờ cũ hơn 7 ngày; backfill chỉ nhận 3/7/30 ngày — `polling-window.test.ts` (FR-023, FR-011).
3. Quét một kênh: bình luận mới (không phải của Page, đã quá 5 phút chờ webhook) → ghi `webhook_events` qua `recordWebhookEvent` với `source:'polling'` rồi enqueue `ingest`; bình luận đã có (không dòng mới) → không enqueue; bình luận của Page/quá mới bị bỏ; lỗi một kênh không dừng kênh khác; thành công mới cập nhật `last_polled_at` — `polling.test.ts` (FR-023).
4. Backfill một kênh dùng cùng đường ghi, nguồn `backfill` (không chờ 5 phút, không tính là webhook im lặng) — `polling.test.ts` (FR-011).
5. Cờ `POLLING_ENABLED` mặc định TẮT — `config.test.ts`.
6. Webhook im lặng: `buildBannerModel` có loại `webhook_silent` (chỉ Owner), có khóa i18n vi/en — `channel-banner.test.ts`, `pnpm lint:i18n`; truy vấn `listWebhookSilentChannels` — `packages/db/tests/webhook-silent.int.test.ts` (chạy được thì chạy, không thì ghi rõ).
7. Hash sự kiện quét bù = hash webhook (`eventHashOf` thật) nên không tạo bản sao — `polling.test.ts`.

## File sẽ đọc

Đã đọc: `connector.ts`, `types.ts`, `ingest.ts`, `retention.ts`, `main.ts`, `webhook-events.ts`, `0022_record_webhook_event.sql`, `channel-alerts.ts`, `channel-banner.ts`, `system-banners.tsx`.

## File sẽ sửa / tạo

- `packages/connectors/src/facebook/connector.ts` (+ test): `fetchComments` quét Page theo bài; tùy chọn `maxFeedPosts`.
- `apps/worker/src/jobs/polling-window.ts` (+test): hàm thuần tính cửa sổ.
- `apps/worker/src/jobs/polling.ts` (+test): `pollChannel`, `runPollingCycle`, `backfillChannel`, `startPolling`.
- `apps/worker/src/config.ts` (+test), `main.ts`, `env.example`: cờ `POLLING_ENABLED`.
- `packages/db/src/queries/webhook-silent.ts` (+int test), `runtime.ts` xuất.
- `apps/web/src/lib/channel-banner.ts` (+test), `components/app/system-banners.tsx`, `messages/{vi,en}.json`.
- docs: gap-matrix, codemap, MASTER, CAN_BAN_CUNG_CAP, KIEM_TRA_TAY, QUYET_DINH, handoff.

## Migration

Không có (làn c). Phần cần migration ghi gap `POLLING-CHANNEL-LIST` cho làn b: hàm DEFINER liệt kê kênh `connected` Facebook xuyên workspace cho `cf_worker`.

## Test viết trước

Cửa sổ quét (thuần), `pollChannel`/`backfillChannel` (connector giả + hàm ghi giả), `fetchComments`, mô hình banner — viết đỏ trước.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/facebook/connector.test.ts` · `pnpm --filter @flow/worker exec vitest run src/jobs/polling src/config.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib/channel-banner.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/gửi/thanh toán/PII; ghi qua hàm DEFINER sẵn có; truy vấn banner chỉ đọc trong `withActor`).

## Rủi ro / câu hỏi cho chủ dự án

- Chưa thử trên Page thật: giả định `updated_time` của bài tăng khi có bình luận mới (kiểm ở staging; `CAN_BAN_CUNG_CAP`).
- Job chưa tự chạy trên staging cho tới khi có `POLLING-CHANNEL-LIST` (migration làn b).

## Đề xuất thay đổi

Ghi chú vào docs/05 FR-023 về trần bài/lần và cửa sổ (QP1–QP3).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/QUYET_DINH; không có bảng mới).
