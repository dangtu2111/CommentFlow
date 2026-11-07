## KT-PIPE — Pipeline AI chạy thật trên bình luận (PIPE-ORCHESTRATOR, chỉ DEV)

Điều kiện: DEV (`cf_dev`), `pnpm cf:dev status` ổn, worker đang chạy. Trong `.env.local` của máy code đã đặt `PIPELINE_ENABLED=true`, `PIPELINE_WORKSPACE_IDS=e8f9e1e3-a805-491a-81d5-0612fec8d6a2` (Shop Thử 2) và bật LLM thật (`LITELLM_*`, `CLASSIFY_LLM_ENABLED`, `DRAFT_LLM_ENABLED`); khởi động lại worker (`pnpm --filter @flow/worker dev`). Workspace Shop Thử 2 phải có sản phẩm hoặc kiến thức đã xuất bản (nếu không AI sẽ báo chưa có nguồn). Lệnh chỉ chạy được khi `APP_ENV=dev` và cả ba chuỗi kết nối trỏ `cf_dev`; dữ liệu tạo ra mang nhãn `[FIXTURE]`, không phải khách thật.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `pnpm dev:push-webhook` (mặc định đẩy vào "Shop Thử 2" câu "Áo thun basic giá bao nhiêu shop?"). | In "Đã đẩy webhook fixture vào Shop Thử 2" kèm mã sự kiện và mã bình luận. Lần đầu tự tạo kênh `[FIXTURE] Page thử pipeline`. |
| 2 | Đợi khoảng 1–2 phút (cửa sổ gộp bình luận 30 giây + thời gian AI), mở Hộp thư bình luận của Shop Thử 2. | Có bình luận mới từ "Khách Thử (fixture)", trạng thái chuyển từ "mới" sang "chờ duyệt" hoặc "cần nhân viên". |
| 3 | Mở chi tiết bình luận đó. | Thấy bản nháp gợi ý (ghi rõ "chưa gửi"), nguồn đã dùng, và nếu giá lấy từ sản phẩm thì đúng giá trong dữ liệu; không có nút gửi tự động. |
| 4 | Trang Cài đặt › Mức sử dụng (hoặc bộ đếm lượt): xem số lượt AI. | Tăng đúng 1 lượt cho bình luận vừa xử lý. |
| 5 | Chạy lại `pnpm dev:push-webhook --text "M đen"` ngay sau đó (cùng khách, cùng bài). | Bình luận thứ hai xử lý tiếp theo ngữ cảnh lượt trước (nếu lượt trước là câu hỏi lại size/màu thì trả lời đúng sản phẩm, không hỏi lại lần hai). |
| 6 | Đẩy thêm 4 lần nữa (tổng 5 bình luận cùng khách dưới cùng bài trong 24 giờ). | Câu 1–2 có bản nháp trả lời, câu 3 là câu chốt mời nhắn tin kèm "Cần hỗ trợ thêm", câu 4–5 chuyển "Cần nhân viên" lý do vượt trần (FR-167), không tốn thêm lượt. |
| 7 | Dọn: `pnpm dev:push-webhook --cleanup`. | In số bình luận/bản nháp đã dọn; kênh và dữ liệu fixture biến mất, dữ liệu thật của workspace còn nguyên. |

Nếu bình luận không xử lý: kiểm cờ `PIPELINE_ENABLED`, danh sách workspace, cấu hình LLM, worker đang chạy (health cổng 3001) và nhật ký worker (không có nội dung khách). Nếu hỏng: ghi số bước, mã sự kiện và ảnh chụp.

---
