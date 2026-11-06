## KT-RET — Job retention dữ liệu 12 tháng (RETENTION-JOB, feat-retention-job)

> Chỉ chạy trên DB dev `cf_dev`, KHÔNG chạy trên staging/production. / DEV `cf_dev` only.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Trên dev, chèn một bình luận có `created_at` cách đây 400 ngày và một bình luận 10 ngày | Có 2 dòng |
| 2 | Chạy worker dev (`pnpm --filter @flow/worker dev`), chờ log | Log "đã xóa dữ liệu workspace quá thời hạn lưu" chỉ có SỐ lượng; bình luận 400 ngày mất, bình luận 10 ngày còn |
| 3 | Chèn vài dòng `cf.ai_usage` cũ 100 ngày rồi chờ chu kỳ kế | Dòng cũ biến mất khỏi `cf.ai_usage`, xuất hiện trong `cf.ai_usage_daily` với tổng token/chi phí bằng tổng cũ; `core.action_logs` không đổi |
