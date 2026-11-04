# Kế hoạch `feat/ch-schema` — bảng kênh, bài viết, bình luận, sự kiện webhook + RLS

## Việc

Mã MASTER: `CH-SCHEMA` · FR-010 (bảng `channels`, `reply_language`), FR-021 (`webhook_events`), `posts`, `comments` · Spec: `docs/10` §3.2, §4; `docs/13` §3.1, §4, §5; ADR 005 §3 (mẫu `withActor`).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Tạo bốn bảng nền cho luồng bình luận — `channels` (Fanpage/IG/TikTok đã kết nối), `posts` (bài viết), `comments` (bình luận), `webhook_events` (sự kiện Meta gửi tới, chống trùng) — kèm RLS (mỗi workspace chỉ thấy dữ liệu mình) và phân quyền ghi theo vai trò như ADR 005. Điểm nhạy cảm nhất là **mã truy cập (token) Page**: cột `access_token_enc` không cho `cf_app` đọc/ghi trực tiếp (chỉ hàm DB hẹp ở `TOKEN-ENC` sau này), để lỗi mã hay Staff không thể lấy token. Rủi ro: bảng nhiều cột và có khóa ngoại chéo; dùng khóa ngoại ghép `(workspace_id, …)` để không thể gắn bình luận của workspace A vào kênh của workspace B.

## Điểm chưa rõ

Không có. Quyết định thiết kế (theo spec + mẫu ADR 005; **verifier-db/security kiểm lại độc lập**):
1. **Ai ghi gì** (cùng role `cf_app`, phân biệt bằng `app.user_id`): đường người dùng (`withActor`) và đường hệ thống (job, `withWorkspace` không người dùng).
   - `channels` INSERT/UPDATE: Owner đang hoạt động **hoặc** hệ thống (job cập nhật `status`, `last_polled_at`...). Staff không ghi (docs/13 §3.1 "Kênh ❌ Staff").
   - `posts`, `comments` INSERT/UPDATE: thành viên đang hoạt động (Staff duyệt/gửi/ẩn) **hoặc** hệ thống (ingest).
   - `webhook_events`: ghi **chỉ hệ thống**; đọc: Owner hoặc hệ thống (payload có tên khách).
   - Không bảng nào có DELETE cho `cf_app` (ngắt kênh = `status`; xóa dữ liệu theo job bảo trì riêng — gap `DB-MAINTENANCE-ROLE`).
2. **Token Page không đọc/ghi được bằng `cf_app`:** `access_token_enc` (text, nullable) không có quyền cột nào cho `cf_app`; tạo kênh có token và đọc token do **hàm DEFINER hẹp ở `TOKEN-ENC`** (làm ngay sau). Bảng vẫn dùng được cho tính năng không đụng token (test, fixture).
3. **Cột khóa gửi do Admin:** `send_suspended_until`, `send_suspended_reason`, `rate_limit_override` không có quyền UPDATE cho `cf_app` (Owner không tự gỡ khóa của Admin; Admin ghi qua role/hàm riêng ở GĐ3).
4. **Khóa ngoại ghép chống chéo workspace:** `UNIQUE (workspace_id, id)` trên `channels`, `posts`, `comments`; `posts(workspace_id, channel_id)` → `channels(workspace_id, id)`; `comments(workspace_id, channel_id)`, `(workspace_id, post_id)`, `(workspace_id, merged_into_id)` tương tự.
5. **`webhook_events.workspace_id` nullable** (chưa map được kênh): dòng NULL không workspace nào thấy; ghi bằng hàm DEFINER ở `WH-INGEST` (biết nền tảng + Page ID, tra kênh xuyên workspace). Cùng một Page kết nối ở hai workspace (spec cho phép `unique (platform, external_id, workspace_id)`) → `WH-INGEST` phải xử lý (nhân sự kiện); ghi chú vào gap matrix.
6. Bảng ở schema `cf`; mọi thời gian `timestamptz`; `conversations`/`messages` **không** thuộc nhánh này (GĐ5, MASTER); cột GĐ sau trong `comments` (nhãn, gộp, nghi mạo danh...) tạo sẵn với giá trị mặc định theo spec để khỏi migration lại.

## Tiêu chí nghiệm thu

1. Bốn bảng đúng cột/kiểu/ràng buộc `docs/10` §3.2 (CHECK: platform, status kênh, `reply_language`, trạng thái bình luận 12 giá trị, `label_source`, trạng thái sự kiện; UNIQUE `(platform, external_id, workspace_id)`, `(channel_id, external_id)` cho posts/comments, `event_hash`; chỉ mục `(workspace_id, status, created_time)`) — kiểm bằng: test tích hợp `ch-schema.int.test.ts` + `drizzle-kit` không báo lệch schema.
2. **RLS cô lập:** workspace A không đọc/ghi/xóa được dòng của B trên cả 4 bảng (kể cả biết id); `check-rls` xanh và đỏ khi gỡ policy/hạ policy — kiểm bằng: ma trận `ch-rls.int.test.ts` + test `check-rls`.
3. **Phân quyền ghi theo vai trò:** `channels`: Owner/hệ thống ghi được, Staff/người lạ/Owner workspace khác bị chặn; `posts`/`comments`: thành viên/hệ thống ghi được, người ngoài bị chặn; `webhook_events`: chỉ hệ thống ghi, Owner/hệ thống đọc, Staff không thấy — kiểm bằng: ma trận (vai trò × bảng × lệnh).
4. **Token ẩn:** `cf_app` không SELECT/INSERT/UPDATE được `channels.access_token_enc` (kể cả Owner); không UPDATE được `send_suspended_*`, `rate_limit_override`; `check-rls` đỏ nếu cấp lại — kiểm bằng: test quyền cột + test `check-rls`.
5. **Khóa ngoại ghép:** chèn `post`/`comment` mang `workspace_id` A nhưng `channel_id` của B → lỗi khóa ngoại — kiểm bằng: test (Postgres 23503).
6. **Chống trùng:** chèn lặp `(channel_id, external_id)` bình luận/bài, `event_hash` → 23505 (WH-INGEST dùng `ON CONFLICT DO NOTHING`) — kiểm bằng: test.
7. Dòng `webhook_events` có `workspace_id` NULL không hiện cho bất kỳ `withWorkspace`/`withActor` nào — kiểm bằng: test.
8. Không có DELETE: `cf_app` DELETE trên 4 bảng bị chặn — kiểm bằng: test + `check-rls`.
9. Kiểm chứng độc lập một lần (`verifier-security` + `verifier-db`), sửa hết "Chặn merge" — kiểm bằng: báo cáo trong PR.
10. Công cụ xanh: `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans && pnpm check:migrations && pnpm test && pnpm test:trace && pnpm test:coverage`, `pnpm test:db`, `pnpm db:check-rls` (đọc mã thoát từng lệnh).

## File sẽ đọc (≤ ~8, kèm lý do)

1. `docs/10_Database_Design.md` §3.2, §4 — cột và quy tắc (đã đọc).
2. `packages/db/src/schema/cf/ai-usage.ts`, `schema/core/tenancy.ts` — mẫu Drizzle (đã đọc).
3. `packages/db/migrations/0001`, `0016`, `0018` — mẫu policy/hàm/quyền cột.
4. `packages/db/src/check-rls.ts` — thêm `ACTOR_POLICIES` theo bảng đầy đủ tên (hiện cứng `core.`), danh sách quyền cột cấm.
5. `packages/db/tests/actor-rls.int.test.ts`, `helpers.ts` — mẫu ma trận và hạt giống.
6. `docs/gap-matrix.md`, `docs/codemap.md`, `docs/plans/MASTER.md` — cập nhật.

## File sẽ sửa / tạo

- `packages/db/src/schema/cf/{channels,posts,comments,webhook-events,index}.ts` (Drizzle).
- `packages/db/migrations/0019_ch_schema.sql` (+ `meta/`): bảng (sinh bằng drizzle-kit) + phần viết tay: bật RLS, policy theo ADR, quyền bảng/cột, `REVOKE` cột token/khóa gửi.
- `packages/db/src/check-rls.ts` (+ test): `ACTOR_POLICIES` đủ tên bảng, quyền cột cấm mới, bảng `cf.*` mới.
- `packages/db/tests/{ch-schema,ch-rls}.int.test.ts` (mới); cập nhật test hiện có nếu danh sách bảng/quyền thay đổi.
- Tài liệu: `docs/10` §3.2 (cột `processed_at`, khóa ghép, `updated_at` — đã được cho phép sửa docs/10), `docs/codemap.md`, `docs/gap-matrix.md` (`CH-SCHEMA` ✅ + ghi chú Page ở hai workspace), `docs/plans/MASTER.md`.

## Migration

`0019_ch_schema.sql` — tạo 4 bảng + chỉ mục + ràng buộc; `ENABLE ROW LEVEL SECURITY`; policy từng lệnh (mẫu `workspace_id = current_workspace_id()` + điều kiện vai trò: `is_workspace_owner()`/`is_workspace_member()`/`current_user_id() IS NULL`); `GRANT` bảng và `GRANT` cột (không cấp `access_token_enc`, `send_suspended_*`, `rate_limit_override` cho UPDATE/SELECT-token); không `DELETE`. Đường lùi (comment cuối file): `DROP TABLE cf.webhook_events, cf.comments, cf.posts, cf.channels` (bảng mới, chưa có dữ liệu thật). Tương thích ngược: chỉ thêm bảng.

## Test viết trước

(logic quy tắc phân quyền/cô lập — test đỏ trước)
- `ch-rls.int.test.ts`: ma trận 4 bảng × {Owner W, Staff W, Owner khác, suspended, removed, người lạ, hệ thống} × {SELECT, INSERT, UPDATE, DELETE}; token/cột khóa gửi; webhook NULL.
- `ch-schema.int.test.ts`: CHECK, UNIQUE, khóa ngoại ghép, mặc định.
- `check-rls`: gỡ/hạ policy mới → đỏ; cấp lại quyền cột token → đỏ.

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/ch-schema.int.test.ts tests/ch-rls.int.test.ts tests/check-rls.int.test.ts
pnpm --filter @flow/db exec vitest run src
pnpm db:migrate && pnpm db:check-rls
```

## Cần kiểm chứng độc lập không?

**Có — đúng một lần ở cuối nhánh** (`verifier-db` + `verifier-security`, model Opus): migration 0019, policy theo vai trò, quyền cột token, khóa ngoại ghép, `webhook_events` NULL. Đầu vào: diff + mục spec, không kèm lập luận của người viết.

## Rủi ro / câu hỏi cho chủ dự án

- Cùng một Page kết nối ở hai workspace (spec cho phép): `WH-INGEST` phải xử lý; ghi gap matrix. Không cần quyết định ở nhánh này.
- Token chưa thể ghi/đọc đến khi làm `TOKEN-ENC` (nhánh kế tiếp, ngay sau): chủ ý, để token không bao giờ đi qua `cf_app` ở dạng cột thường.
- Không có bước bấm tay (chỉ bảng + test): Kiểm tra tay không áp dụng.

## Đề xuất thay đổi

`docs/10` §3.2: CHƯA được phép sửa — nội dung đề xuất ghi ở `docs/decisions/007-kenh-binh-luan-rls.md` §5 (chờ chủ dự án cho phép).

## Complexity tracking

- **Khóa ngoại ghép `(workspace_id, …)`** tăng độ phức tạp so với khóa ngoại đơn: cần để DB tự cấm gắn dữ liệu chéo workspace (nguyên tắc #2). Phương án đơn giản hơn đã loại: chỉ dựa vào mã ứng dụng/RLS (RLS không chặn khóa ngoại trỏ sang workspace khác).
- Không thêm thư viện.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy ghi theo vai trò hay chỉ theo workspace — 4 bảng, ghi theo vai trò/hệ thống (mục "Điểm chưa rõ" 1)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt theo PROMPT_BUILD_TOAN_BO §1.2: quyết định theo `docs/10` §3.2 và mẫu ADR 005 đã duyệt; chủ dự án đã duyệt thứ tự MASTER ngày 04/11/2026; phần thiết kế phân quyền do hai verifier Opus kiểm lại).
