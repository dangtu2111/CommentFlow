## KT-KBSYNC — Đồng bộ kiến thức vào bản nháp rồi Xuất bản (DEV)

Điều kiện: DEV (`cf_dev`), `pnpm cf:dev status` ổn, dịch vụ ml (bge-m3) chạy, model embedding đã kích hoạt (`pnpm --filter @flow/worker kb:switch-embedding -- --status` ra `bge-m3`), worker đang chạy. Đăng nhập bằng tài khoản Owner của Shop Thử 2.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `pnpm --filter @flow/worker kb:sync -- e8f9e1e3-a805-491a-81d5-0612fec8d6a2`. | In số đoạn nháp theo loại (policy, product, faq, shop), mọi đoạn "có vector bge-m3", và danh sách mâu thuẫn (hoặc "không có"). Chạy lại: "ghi 0 đoạn". |
| 2 | Mở `/app/kb-publish`. | Thấy khối "Đồng bộ kiến thức", banner vàng "Chưa xuất bản kiến thức" (nếu chưa từng xuất bản), phần xem thay đổi có các đoạn thêm mới. Nếu có chính sách mâu thuẫn: khung đỏ nêu 2 câu + nguồn. |
| 3 | Bấm "Đồng bộ kiến thức". | Trang quay lại với thông báo "Đã xếp việc đồng bộ"; sau ít phút số đoạn không đổi (không có thay đổi mới). |
| 4 | Sửa một chính sách ở `/app/kb/policies`, lưu, đợi ~10–20 giây, tải lại `/app/kb-publish`. | Bản nháp chỉ đổi đúng đoạn của mục vừa sửa. |
| 5 | Bấm Xuất bản (tick xác nhận vì có đổi Sản phẩm/Chính sách). | Phiên bản mới xuất hiện trong danh sách; banner chưa xuất bản biến mất. |
| 6 | Mở ô Thử AI, hỏi "how long until I get my order?" rồi "chất liệu áo này là gì?". | Câu 1 ra chính sách giao hàng có nguồn; câu 2 trả lời từ mô tả sản phẩm (nếu thẻ sản phẩm có chất liệu); không có giá/tồn lấy từ đoạn kiến thức. |

Nếu hỏng: ghi lại bước nào, nhật ký worker (`kb-sync xong` / lỗi `CONFIG_INVALID` nếu ml tắt) và mở issue.
