# Quyết định agent tự chọn — chờ chủ dự án duyệt lại

> Theo `AGENTS.md` § Quy tắc hỏi (05/11/2026). Mỗi dòng: quyết định, lý do, cách đảo ngược. Danh sách thay đổi `docs/01–16` ghi ở cuối.

| # | Ngày | Việc | Quyết định (khuyến nghị đã chọn) | Lý do | Đảo ngược |
|---|---|---|---|---|---|
| Q1 | 05/11 | Làn song song | Worktree dựng ở `../CommentFlow-wt-a/b/c` (không dùng `../CommentFlow-lane-*`) | Thư mục `CommentFlow-lane-a/b/c` và `.old-nov3` đã tồn tại, không phải git, chứa mã cũ — không xóa/ghi đè dữ liệu chưa xem | Đổi tên thư mục; `git worktree move` |
| Q2 | 05/11 | `docs/12` §1 header rate limit | Đã đúng sẵn (`X-App-Usage` + `X-Business-Use-Case-Usage`, không còn `X-Page-Usage`) — không cần sửa thêm | Kiểm bằng grep | — |

## Thay đổi `docs/01–16`

- 05/11: `docs/15` §6 — thêm đoạn "Migration staging (đường đã chốt)" (qua `migrate-staging.yml`, cổng DB chỉ `127.0.0.1`).
