## KT-SRC — Đối soát Shopify (SHOPIFY-RECONCILE, FR-112/113, feat-shopify-reconcile)

> Chưa có giao diện/bảng lưu; kiểm bằng test + (khi có dev store) một script thử. / No UI or storage yet; verify via tests and, once a dev store exists, a one-off script.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/shared exec vitest run src/shopify-reconcile.test.ts` và `pnpm --filter @flow/worker exec vitest run src/jobs/shopify-reconcile.test.ts` | Mọi test xanh (lệch giá/tồn/tên, sản phẩm biến mất, ngưỡng 5%, webhook thiếu, 1 lần/giờ). |
| 2 | Không đặt `SHOPIFY_ENABLED` | Job không làm gì, không gọi Shopify. |
| 3 | (Có dev store) Đổi giá một biến thể trên Shopify, chạy đối soát | Có đúng một dòng lệch `price` (giá nội bộ cũ / giá Shopify mới); giá nội bộ KHÔNG tự đổi. |
| 4 | Xóa webhook `PRODUCTS_UPDATE` của app, chạy đối soát | Ghi nhận thiếu chủ đề đó và báo Admin. |
| 5 | Bấm "Đối soát ngay" hai lần trong 1 giờ (khi có giao diện) | Lần hai bị từ chối, nói rõ còn bao lâu. |
