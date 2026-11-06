# Bàn giao — nhánh `feat-shopify-reconcile`

Cập nhật: 06/11/2026 · Mục gap matrix: SHOPIFY-RECONCILE · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-shopify-reconcile.md`

## Đã làm
- `packages/shared/src/shopify-reconcile.ts`: `reconcileCatalog` (thuần, KHÔNG sửa dữ liệu), `checkWebhookTopics`, `canRunManualReconcile`.
- Connector: `listWebhookSubscriptions()` (chỉ query).
- Worker: `jobs/shopify-reconcile.ts` (`createShopifyReconcileHandler` + `createInMemoryReconcileStore`); chưa đăng ký hàng đợi/`main.ts`.
- Docs: Q-SRC1 (sửa `docs/09` §7.3), cbcc, KT-SRC, codemap, gap-matrix/MASTER.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `docs/09` §7.3 | Spec cũ tự cập nhật theo Shopify; đổi thành chờ Owner duyệt (Q-SRC1). |
| `connector.ts` | `fetchCatalog` chỉ lấy `status:active` → vắng mặt = `gone_in_shopify`. |
| `jobs/abuse.ts` | Mẫu job: `workspaceJob` + cổng tiêm vào. |

## Còn lại (theo thứ tự)
1. `SHOPIFY-RECONCILE-STORE` (làn b): migration `reconcile_runs`/`reconcile_diffs` + kết nối cửa hàng; bản DB của `ShopifyReconcilePorts` (`connectorFor`, `loadInternal`, `lastManualRunAt`, `recordRun`, `registerWebhooks`, `notify`); hàng đợi + lịch 02:00 theo múi giờ + đăng ký `main.ts`; giao diện duyệt lệch; áp lệch đã duyệt + lưu trữ sản phẩm biến mất.
2. Kiểm với dev store: truy vấn `webhookSubscriptions`, tên chủ đề.
3. Chống chạy trùng "Đối soát ngay" đồng thời (khóa advisory theo workspace hoặc `INSERT … ON CONFLICT` chiếm chỗ + `singletonKey` khi xếp job) — TRƯỚC khi đăng ký job.

## Từ verifier-security (không chặn merge)
- Đã sửa: `trigger` bắt buộc (bỏ mặc định `nightly`); ghi yêu cầu nguyên tử vào chú thích cổng `lastManualRunAt`.
- Còn lại trước khi bật: (a) gọi Shopify ngoài giao dịch `withJob` (chỉ đọc/ghi DB trong giao dịch); (b) `webhookSubscriptions(first: 100)` chưa phân trang/lọc theo chủ đề; (c) lần chạy lỗi chưa ghi `reconcile_runs` (chỉ mã lỗi) nên chưa tính vào giới hạn 1 lần/giờ; (d) nơi xếp job thủ công phải lấy `workspaceId` từ phiên.
