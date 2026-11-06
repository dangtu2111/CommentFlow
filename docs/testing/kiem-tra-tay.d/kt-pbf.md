## KT-PBF — Quét bù bình luận + banner webhook im lặng (POLLING-BACKFILL, FR-023)

Điều kiện: Page thử đã kết nối (KT-014), webhook đang chạy (KT-002), worker bật `POLLING_ENABLED=true`, `POLLING-CHANNEL-LIST` đã có.
1. Trên Page thử, đăng một bình luận mới rồi **tắt webhook** (hoặc tạm đổi `META_APP_SECRET` sai ở web để webhook bị từ chối). — Mong đợi: bình luận chưa hiện ở trang Bình luận ngay.
2. Chờ > 10 phút (5 phút chờ webhook + chu kỳ quét 5 phút). — Mong đợi: bình luận xuất hiện ở trang Bình luận (do quét bù).
3. Đăng nhập bằng Owner, mở bất kỳ trang trong `/app`. — Mong đợi: banner "Webhook có thể đang bị sót tin: <tên Page>" (en: "Webhook may be dropping events: …").
4. Đăng nhập bằng Staff. — Mong đợi: KHÔNG thấy banner này.
5. Bật lại webhook, đăng bình luận mới. — Mong đợi: bình luận hiện ngay; banner biến mất sau lần tải trang kế.
6. Kiểm tra không trùng: bình luận ở bước 2 chỉ xuất hiện một lần. — Mong đợi: một dòng.
7. Chuyển ngôn ngữ vi ↔ en. — Mong đợi: banner đổi ngôn ngữ.

---
