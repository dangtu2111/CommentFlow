# 007 — Bảng kênh, bài viết, bình luận, sự kiện webhook và RLS (04/11/2026)

Trạng thái: **Đã áp dụng** ở `feat/ch-schema` (migration 0019). Căn cứ: `docs/10` §3.2, §4; `docs/13` §3.1, §4, §5; ADR 005 §3 (mẫu `withActor`).

## 1. Ai ghi gì (cùng role `cf_app`)

Ba đường, phân biệt bằng `app.user_id` và `app.ctx`:
- **Người dùng** (`withActor`: có `app.user_id`);
- **Hệ thống / job** (`withJob`, mới: `app.ctx = 'system'`, không người dùng → `core.is_system_context()`);
- **`withWorkspace()` trần**: không người dùng, KHÔNG phải hệ thống — chỉ đọc. Quên `withActor` ở route web thì bị **từ chối ghi** (fail-closed), không được nâng quyền (kiểm chứng bảo mật CH-SCHEMA). Worker dùng `withJob` (`workspaceJob`).

| Bảng | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `channels` | hệ thống/trần hoặc thành viên đang hoạt động | **không có** (tạo qua hàm DEFINER của `TOKEN-ENC` sau khi xác minh token) | Owner hoặc hệ thống; đường người dùng chỉ đổi `name`, `reply_language` (trigger) | không |
| `posts` | như trên | **chỉ hệ thống** | chỉ hệ thống | không |
| `comments` | như trên | **chỉ hệ thống** | thành viên đang hoạt động hoặc hệ thống; đường người dùng không sửa `text`, tác giả, `attachments`, `is_own`, `is_impersonation_suspected` và `replied_by`/`locked_by` phải là chính người gọi (trigger) | không |
| `webhook_events` | Owner đang hoạt động hoặc hệ thống (payload có tên khách) | **chỉ hệ thống** | chỉ hệ thống | không |

- SELECT đòi thành viên khi có người dùng (sai id ở đường người dùng không lộ dữ liệu).
- Không DELETE cho `cf_app`: ngắt kênh = `status`; xóa dữ liệu theo job/role bảo trì (gap `DB-MAINTENANCE-ROLE`).
- `check-rls`: đỏ nếu thiếu policy "người gọi"/"hệ thống", có policy permissive thứ hai không có kiểm đó, policy hệ thống bị nới thành "không có người dùng" thuần, `cf_app` lấy lại quyền cột hay quyền DELETE (`NO_DELETE_TABLES`).
- **Giới hạn đã biết:** đường người dùng vẫn đổi được `comments.status` sang trạng thái dành cho hệ thống (`sending`, `auto_replied`...) — `sendRecheck` là chốt cuối; thiết kế chốt trạng thái ở gap `COMMENTS-STATUS-GUARD` (làm cùng `FB-REPLY`/hành động inbox).

## 2. Token Page và cột do Admin

- `channels.access_token_enc` (**bytea**, AES-GCM) và `key_version` (int, mặc định 1, xoay khóa — docs/10 §1, docs/13 §5): `cf_app` **không có quyền cột nào**. Tạo kênh/ghi/xóa token: hàm DEFINER `cf.create_channel`, `cf.set_channel_token`, `cf.clear_channel_token` (Owner đang hoạt động hoặc hệ thống; migration 0020). **Đọc ciphertext: `cf.read_channel_token` — CHỈ đường hệ thống** (`withJob`/worker); Owner/web không đọc được (quyết định chủ dự án 05/11/2026: gửi trả lời luôn qua job `send` của worker). Mã hóa AES-256-GCM chạy trong mã ứng dụng (`@flow/connectors`: `createTokenCipher`), khóa `TOKEN_ENC_KEYS` (`v1:<hex>,v2:<hex>`) ở env, DB không bao giờ thấy khóa; AAD = `workspace_id|channel_id|key_version`. Không giải mã được (thiếu/sai khóa/AAD/hỏng) → kênh `expired` ("cần kết nối lại") và connector nhận `TOKEN_EXPIRED`, không log token/ciphertext. Trigger `guard_channel_user_update` chặn mọi role trừ CHỦ BẢNG (hàm DEFINER chạy dưới chủ hàm = chủ bảng nên cập nhật được cột hệ thống sau khi tự kiểm quyền; fail-closed với role mới). `core.is_system_context()` đã COALESCE (luôn true/false) và `check-rls` kiểm thân hàm, hai trigger giới hạn cột, `cf_app` không INSERT/không quyền cột `key_version`. **Giới hạn đã biết:** web và worker dùng chung role `cf_app` và `app.ctx` do `cf_app` tự đặt được, nên nếu tiến trình web bị chiếm hoàn toàn thì kẻ đó gọi được `read_channel_token` rồi giải mã bằng khóa web đang giữ (cùng mô hình ADR 005 §3); về lâu dài tách role DB cho worker và chỉ cấp EXECUTE `read_channel_token` cho role đó (gap `WORKER-DB-ROLE`).
- `send_suspended_until`, `send_suspended_reason`, `rate_limit_override`: `cf_app` chỉ **đọc**; Admin ghi qua role/hàm riêng ở GĐ3. Lưu ý: khóa gắn theo hàng `channels` — Owner nối cùng Page ở workspace khác được hàng mới chưa bị khóa; cổng gửi phải xét khóa theo `(platform, external_id)` xuyên workspace (gap `SEND-LOCK-CROSS-WORKSPACE`).
- Cột định danh (`workspace_id`, `channel_id`, `post_id`, `external_id`, `platform`, `event_hash`, `payload`...) không UPDATE được sau khi tạo.
- Drizzle: `select()`/`.returning()` không đối số trên `channels` liệt kê cả cột token và bị từ chối — dùng `channelReadColumns`.

## 3. Chống dữ liệu chéo workspace

`UNIQUE (workspace_id, id)` trên `channels`, `posts`, `comments`; khóa ngoại **ghép** `(workspace_id, channel_id)`, `(workspace_id, channel_id, post_id)` (bình luận phải thuộc ĐÚNG kênh của bài — `UNIQUE (workspace_id, channel_id, id)` trên `posts`), `(workspace_id, merged_into_id)` với `ON DELETE SET NULL (merged_into_id)` (chỉ đặt NULL cột con, không đụng `workspace_id`; PG15+). RLS không chặn khóa ngoại trỏ sang workspace khác — khóa ghép thì có.

## 4. `webhook_events` chưa map workspace

`workspace_id` nullable: dòng NULL không workspace nào thấy (và `cf_app` cũng không chèn được dòng NULL); ghi bằng hàm DEFINER ở `WH-INGEST` (biết nền tảng + Page ID, tra kênh xuyên workspace; **chỉ map vào kênh có `webhook_subscribed = true AND status = 'connected'`** — hai cột này chỉ đường hệ thống đặt được (trigger `guard_channel_user_update`), sau khi đăng ký webhook với Meta bằng token thật; KHÔNG dùng "có `access_token_enc`" làm bằng chứng sở hữu Page vì Owner qua web gọi được `create_channel` + `set_channel_token` với dữ liệu tùy ý (DB không xác minh với Meta) — Owner không tự tạo kênh mang Page ID của shop khác rồi nhận webhook của shop đó). Spec cho phép cùng một Page ở nhiều workspace (`unique (platform, external_id, workspace_id)`) → `UNIQUE NULLS NOT DISTINCT (event_hash, workspace_id)`: một sự kiện một dòng cho MỖI workspace, và một dòng chưa map; `WH-INGEST` dùng `ON CONFLICT DO NOTHING` trên cặp đó. Cột `error` không được chứa PII/token (WH-INGEST che); job xóa sau 30 ngày (docs/10 §6) thuộc `DB-MAINTENANCE-ROLE`; chỉ mục `(status, created_at)` một phần cho job thử lại.

## 5. Sửa `docs/10` §3.2 và §4 — **đã áp dụng** ở `feat/token-enc` (chủ dự án cho phép 05/11/2026)

- `webhook_events`: thêm `processed_at timestamptz`; ghi chú dòng NULL chỉ ghi bằng hàm DEFINER.
- `channels`/`posts`/`comments`: thêm `updated_at`; ghi `unique (workspace_id, id)` và khóa ngoại ghép ở cột "Ghi chú".
- `channels`: ghi chú "`access_token_enc` và cột khóa gửi: `cf_app` không ghi/đọc (xem ADR 007 §2)".
- §4: thêm dòng bảng `channels`/`posts`/`comments`/`webhook_events` vào bảng quyền (theo mục 1 ở đây).
