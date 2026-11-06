## Mẫu cho mục mới

```
## KT-016 — Bình luận trên mobile 390px (INBOX-MOBILE, feat-inbox-mobile)
Điều kiện: workspace có ≥ 1 bình luận; trình duyệt giả lập 390px (DevTools).
| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở `/app/comments` ở 390px | Chỉ thấy tab (cuộn ngang) + bộ lọc + danh sách; không có khung chi tiết; không cuộn ngang cả trang |
| 2 | Chạm một bình luận | Chi tiết toàn màn hình, có "← Quay lại danh sách" (en: "← Back to list") |
| 3 | Chạm Quay lại | Về danh sách, tab/lọc/tìm giữ nguyên |
| 4 | Nút Back của trình duyệt ở bước 2 | Cũng về danh sách |
| 5 | Các tab, ô lọc, nút Quay lại | Chạm được dễ (cao ≥ 44px); ô lọc rộng hết dòng |
| 6 | Nới cửa sổ ≥ 900px | Bố cục desktop như cũ; không thấy nút Quay lại |
| 7 | Lặp bước 1–3 ở tiếng Anh | Chuỗi đúng ngôn ngữ |

## KT-00N — <tên tính năng> (PR #...)
Điều kiện: ...
| # | Bước | Kết quả mong đợi |   (≤ 10 bước, cả vi và en)
```
