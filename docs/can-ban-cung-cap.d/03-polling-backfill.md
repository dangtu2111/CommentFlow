## 2d. Quét bù bình luận (`POLLING-BACKFILL`, `FB-BACKFILL`, `FB-FETCH-PAGE-WIDE`)

Code đã xong-mock (connector giả/fixture). Để bật đường thật trên staging bạn cần:
1. Page thử có vài bài viết + bình luận, đã kết nối qua mục 1 (kênh `connected`, `webhook_subscribed`).
2. Đặt `POLLING_ENABLED=true` cho **worker** (cần `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENC_KEYS`). Mặc định TẮT.
3. Chờ `POLLING-CHANNEL-LIST` (migration của làn b: hàm liệt kê kênh xuyên workspace) — chưa có thì worker chỉ báo lỗi cấu hình và không quét.
4. Kiểm trên Page thật giả định: `updated_time` của bài tăng khi có bình luận mới (nếu không, đổi cách chọn bài — QP1).
Không cần khóa mới nào ngoài mục 1. Kiểm tay: KT-PBF.
