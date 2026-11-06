# Bàn giao — nhánh `feat-polling-backfill`

Cập nhật: 06/11/2026 · Mục gap matrix: POLLING-BACKFILL, FB-BACKFILL, FB-FETCH-PAGE-WIDE, BANNERS-OTHER (webhook im lặng) · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-polling-backfill.md`

## Đã làm
- Connector: `fetchComments` quét Page theo bài (QP1). Worker: `jobs/polling.ts` + `polling-window.ts`, cờ `POLLING_ENABLED` (tắt). DB: `listWebhookSilentChannels`. Web: banner webhook im lặng (Owner), i18n vi/en.
- Tài liệu: QP1–QP5, FR-023 (docs/05), gap-matrix, codemap, MASTER, CAN_BAN_CUNG_CAP §2d, KT-021.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `0022_record_webhook_event.sql` | Hàm ghi chỉ chạy ở `withSystem` trần; trả dòng mới (hoặc dòng received/failed) → chính là tín hiệu "webhook chưa báo" |
| channels RLS (0019) | Không liệt kê kênh xuyên workspace được ngoài hàm DEFINER → cần migration |

## Còn lại
1. `POLLING-CHANNEL-LIST` (migration làn b) + nối lister/connector/`boss.send` vào `main.ts` (`createDbPollingStore` đã có).
2. `FB-BACKFILL-UI`.
3. Chạy `packages/db/tests/webhook-silent.int.test.ts` trên máy có DB (chưa chạy được ở máy này: vitest int lỗi khởi động).
4. Kiểm giả định `updated_time` trên Page thật (KT-021).
