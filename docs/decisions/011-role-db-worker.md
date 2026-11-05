# 011 — Role DB riêng cho worker (`cf_worker`) (06/11/2026)

Trạng thái: **Đã áp dụng** ở `feat/worker-db-role` (migration 0030, mã worker, test; CHƯA chạy trên staging — xem §5). Gap `WORKER-DB-ROLE`, bắt buộc trước staging (chủ dự án chốt 06/11/2026). Căn cứ: ADR 007 §2 ("Giới hạn đã biết"), ADR 005 §3, ADR 008 §3, ADR 009.

## 1. Vấn đề

Web và worker cùng đăng nhập Postgres bằng `cf_app`. "Ngữ cảnh hệ thống" chỉ là biến phiên `app.ctx = 'system'` (kèm không có `app.user_id`) mà `cf_app` tự đặt được. Hệ quả: nếu tiến trình web bị chiếm hoàn toàn, kẻ đó đặt `app.ctx = 'system'`, thành "hệ thống" và (1) gọi `cf.read_channel_token` lấy ciphertext token Page, rồi giải mã bằng khóa `TOKEN_ENC_KEYS` mà web giữ; (2) ghi kết quả gửi/ẩn giả, chèn bình luận/bài giả.

## 2. Quyết định

- **Role `cf_worker`** (LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE/DB), mật khẩu riêng `CF_WORKER_PASSWORD`, **thành viên của `cf_app`** (kế thừa quyền bảng/hàm/policy; không nhân đôi GRANT; policy `TO cf_app` áp cho cf_worker). **`cf_app` và `cf_auth` không được là thành viên `cf_worker`** (không `SET ROLE` sang được).
- **"Hệ thống" = kết nối đăng nhập bằng `cf_worker`:** `core.is_system_context()` thêm `AND session_user = 'cf_worker'`. `session_user` là role ĐĂNG NHẬP của kết nối; `SET ROLE` không đổi được, chỉ superuser mới `SET SESSION AUTHORIZATION`. Vì mọi policy ghi hệ thống và hàm DEFINER chỉ-hệ thống (kênh, posts, comments, webhook, kết quả gửi/ẩn, `read_channel_token`, dọn payload…) dựa vào hàm này nên được bảo vệ cùng lúc, không phải sửa từng nơi. (Role DB không "đặt" được `app.ctx` — biến tự do — nên chặn thật nằm ở kiểm role đăng nhập.)
- **`cf.read_channel_token`**: thu hồi EXECUTE khỏi `cf_app`, cấp riêng `cf_worker` (lớp hai). Các hàm ghi token (`create_channel`, `set_channel_token`, `clear_channel_token`) vẫn cho `cf_app`: Owner ghi token ở callback OAuth (web) — web ghi được, không đọc được.
- **Cấu hình:** worker đọc `DATABASE_WORKER_URL` (bắt buộc, zod; phải đăng nhập bằng `cf_worker`; thay `DATABASE_URL` cho cả `withJob`/`withWorkspace` của worker lẫn pg-boss). Web KHÔNG nhận biến này và không nhận `CF_WORKER_PASSWORD` (compose chỉ gắn vào service `worker`). Test dùng `TEST_DATABASE_WORKER_URL` (`CF_LANE` đổi tên DB như ba URL kia).
- **Tạo role ngoài migration** (cf_owner không có CREATEROLE; cùng mẫu `cf_auth` 0010): script khởi tạo Postgres (volume mới, CI, staging mới), `pnpm cf:dev add-worker-role` (máy ảo đã có volume; idempotent, sinh mật khẩu vào `.env.cf-dev`, không in). Migration 0030 chỉ KIỂM: role tồn tại, đúng thuộc tính, kế thừa `cf_app`, `cf_app` không thuộc `cf_worker`.
- **`pnpm db:check-rls`** kiểm: thân `is_system_context` có `session_user` + `cf_worker` và không có `OR` (không phân biệt hoa thường); `cf_worker` không có quyền trực tiếp (bảng/cột/sequence/hàm ngoài `read_channel_token`) và không thuộc `cf_owner`; `cf_app` không EXECUTE `read_channel_token`, `cf_worker` có, PUBLIC không; thuộc tính/CREATE của `cf_worker`; quan hệ thành viên.

## 3. Còn lại (đã chấp nhận)

- Web bị chiếm vẫn tự đặt `app.user_id`/`app.workspace_id` (ADR 005 §3: chống quên kiểm quyền, không chống chiếm tiến trình) — nhưng hết đường "hệ thống": không đọc được ciphertext, không ghi kết quả gửi/ẩn giả, không gọi hàm chỉ-hệ thống. Còn gọi được `cf.record_webhook_event` (web nhận webhook) nên có thể tiêm sự kiện webhook giả để worker ingest — giới hạn đã biết, chống bằng xác minh lại chữ ký ở worker (chưa làm).
- Ai chiếm được tiến trình worker (có `DATABASE_WORKER_URL` và `TOKEN_ENC_KEYS`) là hệ thống — đúng thiết kế; worker không mở cổng ra ngoài ngoài `/health`.
- **Không tương thích ngược (chấp nhận):** worker bản cũ (dùng `cf_app`) chạy sau khi migrate 0030 mất quyền hệ thống (lỗi `42501`, yêu cầu `sending` kẹt, job `failed`). Chấp nhận vì chưa có staging chạy thật. Quy trình: dừng worker cũ TRƯỚC migrate, bật worker mới (`DATABASE_WORKER_URL`) ngay sau, rồi kiểm không còn yêu cầu `sending`/job `failed` do `42501` (`docs/staging/H5-CHECKLIST.md`).
- **Rủi ro còn lại đã chấp nhận — web bị chiếm đẩy job cho worker:** web vẫn ghi được hàng đợi (pg-boss) nên kẻ chiếm web có thể đưa job tùy ý cho worker, và worker chạy job dưới quyền hệ thống. Vì vậy MỌI handler job phải kiểm lại trạng thái trong DB (yêu cầu còn `queued`, kênh/bình luận khớp workspace, hạn mức, cửa sổ 24 giờ…), không tin dữ liệu trong payload job.
- **Compose production phải tách env theo service như staging:** `web` chỉ nhận `DATABASE_URL`/`DATABASE_AUTH_URL`; `worker` chỉ nhận `DATABASE_WORKER_URL` (không `DATABASE_URL`, không mật khẩu `cf_app`/`cf_auth`); không dùng một anchor chung chứa URL DB. Staging đã làm vậy (`infra/docker-compose.staging.yml`).
- **Role `cf_worker` không được là thành viên `cf_owner`** (hoặc role chạy migration): migration 0030 và `db:check-rls` kiểm; `cf_worker` cũng không có quyền TRỰC TIẾP nào trên bảng/cột/sequence/hàm (trừ EXECUTE `read_channel_token`) — mọi quyền khác chỉ do kế thừa `cf_app`.
- `withSystem` (ngữ cảnh trần) của web (`record_webhook_event`) và của worker (hàm dọn payload webhook) không đổi: các hàm đó vốn đòi KHÔNG phải hệ thống.

## 4. Đường lùi

Lùi SQL + check-rls CÙNG LÚC, rồi mới đổi worker về `DATABASE_URL`: `CREATE OR REPLACE core.is_system_context()` về bản 0020, `GRANT EXECUTE ON FUNCTION cf.read_channel_token(uuid) TO cf_app`, `REVOKE` quyền của `cf_worker`. Role giữ (xóa bằng `DROP ROLE` bởi superuser).

## 5. Triển khai

- Máy ảo dev: `pnpm cf:dev add-worker-role` TRƯỚC khi migrate; chủ dự án sinh lại `.env` bằng `print-dev-env.sh` (có `DATABASE_WORKER_URL`, `TEST_DATABASE_WORKER_URL`).
- Staging: volume mới → init script tạo role (cần `CF_WORKER_PASSWORD` trong `.env.cf-staging`, do `gen-staging-env.sh` sinh); volume đã có → chạy `CREATE ROLE`/`GRANT` thủ công theo `docs/staging/H5-CHECKLIST.md` TRƯỚC migrate. Không có đường tự động chạy lên staging từ máy dev.
