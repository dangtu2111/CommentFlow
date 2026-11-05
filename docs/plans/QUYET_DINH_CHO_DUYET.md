# Quyết định agent tự chọn — chờ chủ dự án duyệt lại

> Theo `AGENTS.md` § Quy tắc hỏi (05/11/2026). Mỗi dòng: quyết định, lý do, cách đảo ngược. Danh sách thay đổi `docs/01–16` ghi ở cuối.

| # | Ngày | Việc | Quyết định (khuyến nghị đã chọn) | Lý do | Đảo ngược |
|---|---|---|---|---|---|
| Q1 | 05/11 | Làn song song | Worktree dựng ở `../CommentFlow-wt-a/b/c` (không dùng `../CommentFlow-lane-*`) | Thư mục `CommentFlow-lane-a/b/c` và `.old-nov3` đã tồn tại, không phải git, chứa mã cũ — không xóa/ghi đè dữ liệu chưa xem | Đổi tên thư mục; `git worktree move` |
| Q2 | 05/11 | `docs/12` §1 header rate limit | Đã đúng sẵn (`X-App-Usage` + `X-Business-Use-Case-Usage`, không còn `X-Page-Usage`) — không cần sửa thêm | Kiểm bằng grep | — |
| Q3 | 05/11 | BULK-ACTIONS: bộ nhãn "Đổi nhãn" | Khóa chuẩn `price`, `advice`, `purchase`, `complaint`, `spam`, `other` (Hỏi giá/Tư vấn/Mua hàng/Khiếu nại/Spam/Khác theo docs/05, 07) ở `shared/comment-labels.ts`; hiển thị dịch theo ngôn ngữ; nhãn ngoài danh sách bị từ chối | Chưa có bộ phân loại; chọn khóa ổn định, không phụ thuộc ngôn ngữ | Sửa danh sách ở một file; dữ liệu cũ dạng chữ tự do vẫn hiển thị nguyên văn |
| Q4 | 05/11 | BULK-ACTIONS: trần mỗi lần | Tối đa 50 bình luận/lần; Ẩn xử lý tuần tự từng cái qua `requestCommentHide` | Giới hạn rủi ro ẩn nhầm và tải; giữ đường ẩn hiện có | Đổi hằng `BULK_MAX` |
| Q5 | 05/11 | BULK-ACTIONS: phím tắt | `X` chọn dòng, `J/K` đổi dòng, `H` mở hộp xác nhận ẩn (không ẩn ngay), `Esc` bỏ chọn; `E`/`M` (docs/03) chưa rõ nghĩa nên chưa làm | docs/08 chỉ nêu `H`, `J/K`; ẩn luôn qua xác nhận | Sửa `lib/bulk-shortcuts.ts` |
| Q6 | 05/11 | BULK-ACTIONS: bình luận đang bị đồng nghiệp khóa | Bỏ qua cái đó (gộp vào "không áp dụng được" trong báo kết quả); không ghi đè khóa | Trigger 0027 chặn ghi đè khóa còn hạn; tránh giành việc | — |

## Thay đổi `docs/01–16`

- 05/11: `docs/15` §6 — thêm đoạn "Migration staging (đường đã chốt)" (qua `migrate-staging.yml`, cổng DB chỉ `127.0.0.1`).
