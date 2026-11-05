# Quyết định agent tự chọn — chờ chủ dự án duyệt lại

> Theo `AGENTS.md` § Quy tắc hỏi (05/11/2026). Mỗi dòng: quyết định, lý do, cách đảo ngược. Danh sách thay đổi `docs/01–16` ghi ở cuối.

| # | Ngày | Việc | Quyết định (khuyến nghị đã chọn) | Lý do | Đảo ngược |
|---|---|---|---|---|---|
| Q1 | 05/11 | Làn song song | Worktree dựng ở `../CommentFlow-wt-a/b/c` (không dùng `../CommentFlow-lane-*`) | Thư mục `CommentFlow-lane-a/b/c` và `.old-nov3` đã tồn tại, không phải git, chứa mã cũ — không xóa/ghi đè dữ liệu chưa xem | Đổi tên thư mục; `git worktree move` |
| Q2 | 05/11 | `docs/12` §1 header rate limit | Đã đúng sẵn (`X-App-Usage` + `X-Business-Use-Case-Usage`, không còn `X-Page-Usage`) — không cần sửa thêm | Kiểm bằng grep | — |
| Q4 | 05/11 | `feat/fr-005-count` | "Cần xử lý" = bình luận chưa xóa + chưa gộp ở `new`/`processing`/`pending_review`/`needs_human`/`send_failed` (khớp định nghĩa đã có ở docs/05 FR-005; chỉ làm rõ thêm). Đếm bằng N giao dịch `withActor` song song (mỗi workspace một lần, hàm `countActionableComments`), lỗi một workspace → bỏ nhãn nơi đó. Không migration, không hàm DB. Nhãn tối đa "99+" | Dùng đúng RLS sẵn có; N thường nhỏ; không cần đổi schema | Bỏ prop `counts` ở layout (nhãn biến mất, không ảnh hưởng chức năng khác) |

## Thay đổi `docs/01–16`

- 05/11: `docs/15` §6 — thêm đoạn "Migration staging (đường đã chốt)" (qua `migrate-staging.yml`, cổng DB chỉ `127.0.0.1`).
- 05/11: `docs/05` FR-005 — làm rõ "số cần xử lý": thêm "chưa gộp", "Mới = new + processing", loại trạng thái AI tự xử lý/spam/đã xong, hiển thị tối đa "99+" (quyết định Q4).
