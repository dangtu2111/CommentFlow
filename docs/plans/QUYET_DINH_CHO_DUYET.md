# Quyết định agent tự chọn — chờ chủ dự án duyệt lại

> Theo `AGENTS.md` § Quy tắc hỏi (05/11/2026). Mỗi dòng: quyết định, lý do, cách đảo ngược. Danh sách thay đổi `docs/01–16` ghi ở cuối.

| # | Ngày | Việc | Quyết định (khuyến nghị đã chọn) | Lý do | Đảo ngược |
|---|---|---|---|---|---|
| Q1 | 05/11 | Làn song song | Worktree dựng ở `../CommentFlow-wt-a/b/c` (không dùng `../CommentFlow-lane-*`) | Thư mục `CommentFlow-lane-a/b/c` và `.old-nov3` đã tồn tại, không phải git, chứa mã cũ — không xóa/ghi đè dữ liệu chưa xem | Đổi tên thư mục; `git worktree move` |
| Q2 | 05/11 | `docs/12` §1 header rate limit | Đã đúng sẵn (`X-App-Usage` + `X-Business-Use-Case-Usage`, không còn `X-Page-Usage`) — không cần sửa thêm | Kiểm bằng grep | — |
| Q3 | 05/11 | `feat/staging-db-loopback` | Postgres staging publish `127.0.0.1:${CF_STAGING_DB_PORT:-5434}:5432`; kiểm bằng test đọc compose theo dòng (không thêm thư viện YAML), dạng object bị coi là đỏ | Loopback = chỉ máy ảo nối được; test chặn `0.0.0.0`/bỏ trống host; tránh phụ thuộc mới | Xóa khối `postgres.ports` khỏi compose staging + đổi `CF_STAGING_DB_HOSTS` (không còn đường migrate) |

| Q4 | 05/11 | Cập nhật nhánh làn | Không force-push (settings cấm + quy tắc); cập nhật bằng `git merge origin/main` | Chống mất lịch sử | — |

## Thay đổi `docs/01–16`

- 05/11: `docs/15` §6 — thêm đoạn "Migration staging (đường đã chốt)" (qua `migrate-staging.yml`, cổng DB chỉ `127.0.0.1`).

| Q3 | 05/11 | SEND-SWEEP + HIDE-SWEEP cần migration | Làn c (`feat/send-hide-sweep`) dừng; làn b (`feat/worker-db-role`) giữ quyền migration trước (đã chạy). Làn c làm tiếp (migration số kế tiếp) SAU khi PR của làn b merge | Quy tắc "mỗi lúc chỉ một nhánh có migration"; sweep cần hàm DEFINER (quét `queued`/`sending` quá hạn) vì `cf_app` không tự đổi trạng thái hệ thống | Đổi thứ tự nếu bạn muốn sweep trước worker-db-role |
