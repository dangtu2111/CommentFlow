# Quyết định agent tự chọn — chờ chủ dự án duyệt lại

> Theo `AGENTS.md` § Quy tắc hỏi (05/11/2026). Mỗi dòng: quyết định, lý do, cách đảo ngược. Danh sách thay đổi `docs/01–16` ghi ở cuối.

| # | Ngày | Việc | Quyết định (khuyến nghị đã chọn) | Lý do | Đảo ngược |
|---|---|---|---|---|---|
| Q1 | 05/11 | Làn song song | Worktree dựng ở `../CommentFlow-wt-a/b/c` (không dùng `../CommentFlow-lane-*`) | Thư mục `CommentFlow-lane-a/b/c` và `.old-nov3` đã tồn tại, không phải git, chứa mã cũ — không xóa/ghi đè dữ liệu chưa xem | Đổi tên thư mục; `git worktree move` |
| Q2 | 05/11 | `docs/12` §1 header rate limit | Đã đúng sẵn (`X-App-Usage` + `X-Business-Use-Case-Usage`, không còn `X-Page-Usage`) — không cần sửa thêm | Kiểm bằng grep | — |
| Q4 | 05/11 | `feat/fr-005-count` | "Cần xử lý" = bình luận chưa xóa + chưa gộp ở `new`/`processing`/`pending_review`/`needs_human`/`send_failed` (khớp định nghĩa đã có ở docs/05 FR-005; chỉ làm rõ thêm). Đếm bằng N giao dịch `withActor` song song (mỗi workspace một lần, hàm `countActionableComments`), lỗi một workspace → bỏ nhãn nơi đó. Không migration, không hàm DB. Nhãn tối đa "99+" | Dùng đúng RLS sẵn có; N thường nhỏ; không cần đổi schema | Bỏ prop `counts` ở layout (nhãn biến mất, không ảnh hưởng chức năng khác) |
| Q3 | 05/11 | `feat/staging-db-loopback` | Postgres staging publish `127.0.0.1:${CF_STAGING_DB_PORT:-5434}:5432`; kiểm bằng test đọc compose theo dòng (không thêm thư viện YAML), dạng object bị coi là đỏ | Loopback = chỉ máy ảo nối được; test chặn `0.0.0.0`/bỏ trống host; tránh phụ thuộc mới | Xóa khối `postgres.ports` khỏi compose staging + đổi `CF_STAGING_DB_HOSTS` (không còn đường migrate) |

| Q4 | 05/11 | Cập nhật nhánh làn | Không force-push (settings cấm + quy tắc); cập nhật bằng `git merge origin/main` | Chống mất lịch sử | — |
| QFB1 | 05/11 | `feat/fb-oauth` | (a) Dùng lại tên `META_APP_ID`/`META_APP_SECRET`/`META_OAUTH_REDIRECT_URL` sẵn có, không thêm `FB_APP_*`/`FB_REDIRECT_URI`; chỉ thêm `FB_OAUTH_ENABLED`, `FB_LOGIN_CONFIG_ID` (tùy chọn), `CHANNELS_LIMIT_DEFAULT`. (b) Chưa có bảng `plans` → giới hạn kênh = `CHANNELS_LIMIT_DEFAULT` (mặc định 1). (c) Token người dùng giữa callback và bước chọn Page nằm trong cookie niêm phong AES-GCM 10 phút, không DB (không migration). (d) Web đặt `webhook_subscribed` qua `withJob` (cột chỉ hệ thống đặt được; không migration) sau khi đã đối chiếu `/me` + subscribe + đọc lại. (e) Kiểm khóa lúc khởi động chỉ khi cờ bật | (a) tránh hai tên cho cùng một bí mật; (b)(c)(d) không migration theo yêu cầu việc; (e) web chỉ đụng token khi cờ bật | (a) đổi tên trong `fb-oauth-env.ts`; (b) thay bằng `channels_limit` của gói; (c) chuyển sang bảng phiên có TTL; (d) thêm hàm DEFINER `cf.mark_webhook_subscribed` (migration); (e) bỏ điều kiện cờ trong `instrumentation.ts` |

## Thay đổi `docs/01–16`

- 05/11: `docs/15` §6 — thêm đoạn "Migration staging (đường đã chốt)" (qua `migrate-staging.yml`, cổng DB chỉ `127.0.0.1`).
- 05/11: `docs/05` FR-005 — làm rõ "số cần xử lý": thêm "chưa gộp", "Mới = new + processing", loại trạng thái AI tự xử lý/spam/đã xong, hiển thị tối đa "99+" (quyết định Q4).

| Q3 | 05/11 | SEND-SWEEP + HIDE-SWEEP cần migration | Làn c (`feat/send-hide-sweep`) dừng; làn b (`feat/worker-db-role`) giữ quyền migration trước (đã chạy). Làn c làm tiếp (migration số kế tiếp) SAU khi PR của làn b merge | Quy tắc "mỗi lúc chỉ một nhánh có migration"; sweep cần hàm DEFINER (quét `queued`/`sending` quá hạn) vì `cf_app` không tự đổi trạng thái hệ thống | Đổi thứ tự nếu bạn muốn sweep trước worker-db-role |
