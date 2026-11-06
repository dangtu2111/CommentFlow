## KT-ATS — Lưu tệp đính kèm của bình luận (ATTACHMENTS-STORE, feat-attachments-store, FR-143)
Điều kiện: staging có webhook Page thử (cờ kết nối FB bật), worker chạy. Chỉ dùng Page thử của bạn.
| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Trên bài của Page thử, dùng tài khoản thử bình luận kèm một ảnh (có chữ) | Bình luận xuất hiện; `SELECT text, attachments FROM cf.comments` (máy phụ) có `[{"type":"photo","url":"https://…"}]` và chữ đúng |
| 2 | Bình luận chỉ có nhãn dán (sticker), không chữ | Dòng có `text=''`, `attachments` chứa `{"type":"sticker"}` |
| 3 | Bình luận chữ thuần | `attachments = []` |
| 4 | Xóa bình luận có ảnh trên Facebook | `attachments` về `[]` (xóa trắng như FR-048) |
