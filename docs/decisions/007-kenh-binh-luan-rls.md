# 007 — Bảng kênh, bài viết, bình luận, sự kiện webhook và RLS (04/11/2026)

Trạng thái: **Đã áp dụng** ở `feat/ch-schema` (migration 0019). Căn cứ: `docs/10` §3.2, §4; `docs/13` §3.1, §4, §5; ADR 005 §3 (mẫu `withActor`).

## 1. Ai ghi gì (cùng role `cf_app`)

Phân biệt bằng `app.user_id`: **đường người dùng** (`withActor`, có người gọi) và **đường hệ thống** (job, `withWorkspace` không người dùng → `current_user_id() IS NULL`).

| Bảng | SELECT | INSERT / UPDATE | DELETE |
|---|---|---|---|
| `channels` | hệ thống hoặc thành viên đang hoạt động | Owner đang hoạt động hoặc hệ thống (Staff không: `docs/13` §3.1 "Kênh ❌ Staff") | không có |
| `posts`, `comments` | hệ thống hoặc thành viên đang hoạt động | thành viên đang hoạt động hoặc hệ thống (Staff duyệt/gửi/ẩn) | không có |
| `webhook_events` | Owner đang hoạt động hoặc hệ thống (payload có tên khách) | **chỉ hệ thống** | không có |

- SELECT đòi thành viên (khi có người dùng) để **sai id ở đường người dùng không lộ dữ liệu** (khác `ai_usage`, chỉ theo workspace).
- Không có DELETE cho `cf_app`: ngắt kênh = đổi `status`; xóa dữ liệu theo job/role bảo trì (gap `DB-MAINTENANCE-ROLE`).
- `check-rls` đỏ nếu thiếu policy "người gọi", có policy permissive thứ hai không có kiểm đó, hoặc `cf_app` lấy lại quyền cột/DELETE (xem ADR 005 §3).

## 2. Token Page và cột do Admin

- `channels.access_token_enc` (text, nullable): `cf_app` **không có quyền cột nào** (SELECT/INSERT/UPDATE). Tạo kênh kèm token và đọc token do **hàm DEFINER hẹp ở `TOKEN-ENC`** (làm ngay sau); lộ DB cf_app hay lỗi mã không lấy được token.
- `send_suspended_until`, `send_suspended_reason`, `rate_limit_override`: `cf_app` chỉ **đọc**; không INSERT/UPDATE (Owner không tự gỡ khóa của Admin; Admin ghi qua role/hàm riêng ở GĐ3).
- Cột định danh (`workspace_id`, `channel_id`, `post_id`, `external_id`, `platform`, `event_hash`, `payload`...) không UPDATE được sau khi tạo.

## 3. Chống dữ liệu chéo workspace

`UNIQUE (workspace_id, id)` trên `channels`, `posts`, `comments`; khóa ngoại **ghép** `(workspace_id, channel_id)`, `(workspace_id, post_id)`, `(workspace_id, merged_into_id)`. RLS không chặn khóa ngoại trỏ sang workspace khác — khóa ghép thì có.

## 4. `webhook_events` chưa map workspace

`workspace_id` nullable: dòng NULL không workspace nào thấy; ghi bằng hàm DEFINER ở `WH-INGEST` (biết nền tảng + Page ID, tra kênh xuyên workspace). Spec cho phép cùng một Page ở nhiều workspace (`unique (platform, external_id, workspace_id)`) → `WH-INGEST` phải nhân sự kiện cho từng workspace (ghi gap matrix).

## 5. Đề xuất sửa `docs/10` §3.2 (chưa sửa — chờ chủ dự án cho phép)

- `webhook_events`: thêm `processed_at timestamptz`; ghi chú dòng NULL chỉ ghi bằng hàm DEFINER.
- `channels`/`posts`/`comments`: thêm `updated_at`; ghi `unique (workspace_id, id)` và khóa ngoại ghép ở cột "Ghi chú".
- `channels`: ghi chú "`access_token_enc` và cột khóa gửi: `cf_app` không ghi/đọc (xem ADR 007 §2)".
- §4: thêm dòng bảng `channels`/`posts`/`comments`/`webhook_events` vào bảng quyền (theo mục 1 ở đây).
