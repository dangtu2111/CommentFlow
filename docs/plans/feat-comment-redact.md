# Kế hoạch `feat/comment-redact` — Xóa trắng nội dung khi khách xóa bình luận

> Trạng thái duyệt: **Đã duyệt** (chủ dự án quyết 05/11/2026: "COMMENT-PRIVACY-ON-DELETE: đồng ý xóa trắng…", được sửa FR-048 và docs/10 `comments`).

## Việc

Mã gap matrix: `COMMENT-PRIVACY-ON-DELETE` · Spec: FR-048 (docs/05), docs/10 §3.2/§4 `comments`.

**Tóm tắt:** Khi khách xóa bình luận trên Facebook, hệ thống vẫn giữ dòng, trạng thái, thời điểm, liên kết trả lời và nhật ký, nhưng **xóa trắng** nội dung và danh tính khách (`text`, `text_normalized`, `author_name`, `author_external_id`) và ghi `redacted_at`. Bản sao nội dung trong `webhook_events.payload` cũng bị xóa. Việc làm bằng MỘT hàm DB hẹp chỉ đường hệ thống gọi được, để không có đường nào đặt `deleted_at` mà quên xóa trắng.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Hàm `cf.mark_comment_deleted` chạy ở đường hệ thống: đặt `deleted_at`, `redacted_at`, `text=''`, `text_normalized`/`author_name` NULL, `author_external_id=''`; giữ `status`, `created_time`, `external_id`, `comment_replies`, `action_logs` — kiểm bằng test DB.
2. Người dùng (Owner/Staff), ngữ cảnh trần và `withWorkspace` (đọc) KHÔNG gọi được; người dùng không đổi `redacted_at` — test DB.
3. Bản sao nội dung trong `webhook_events.payload` của chính bình luận đó (tạo/sửa) bị thay `{}`; dòng chưa xử lý chuyển `dead` (không tạo lại nội dung); sự kiện của bình luận khác và workspace khác không bị đụng — test DB.
4. Xóa lần hai không đổi gì (idempotent); bình luận không tồn tại → trả NULL, không lỗi — test DB.
5. Migration xóa trắng luôn các bình luận đã `deleted_at` từ trước — test migrate/DB.
6. Worker `ingest` xóa → dùng hàm trên, ghi `comment.deleted` (không nội dung) — test worker.
7. Chi tiết bình luận đã xóa không hiện khung nội dung rỗng/tên khách — test đơn vị.
8. FR-048 (docs/05) và docs/10 `comments` cập nhật; gap ghi phần chưa tồn tại (cache câu trả lời, `kb_answer_examples`, `retrieval_logs`, Langfuse).

## File sẽ đọc

`ingest.ts` (applyDelete), `comment-detail.tsx`, `schema/cf/comments.ts`, migration 0022/0024 (mẫu hàm), docs/10 đoạn comments.

## File sẽ sửa / tạo

`packages/db/migrations/0025_comment_redact.sql` (+ journal/snapshot), `schema/cf/comments.ts` (`redactedAt`), `packages/db/src/comment-redact.ts` (+ export), `apps/worker/src/jobs/ingest.ts`, tests db/worker, `docs/05` FR-048, `docs/10`, gap-matrix, codemap, KT-008.

## Migration

0025: ADD COLUMN `redacted_at`; hàm `cf.mark_comment_deleted(p_channel_id uuid, p_external_id text, p_deleted_at timestamptz) RETURNS uuid` (SECURITY DEFINER, search_path cố định, chỉ khi `core.is_system_context() IS TRUE`, REVOKE PUBLIC, GRANT cf_app); REVOKE UPDATE (deleted_at) khỏi cf_app (chỉ qua hàm); trigger thêm `redacted_at`, `author_external_id`; backfill bình luận đã xóa. Đường lùi: lùi code trước; DROP FUNCTION; GRANT lại UPDATE (deleted_at); CREATE OR REPLACE trigger bản 0024; DROP COLUMN redacted_at (nội dung đã xóa KHÔNG khôi phục được — cố ý).

## Test viết trước

`packages/db/tests/comment-redact.int.test.ts`; worker `ingest.int.test.ts` (sửa test xóa); `reply-state`/detail nếu có.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db test:db`, `pnpm --filter @flow/worker test:db`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration + hàm DEFINER).

## Rủi ro / câu hỏi cho chủ dự án

Không thể khôi phục nội dung đã xóa trắng (cố ý, theo quyết định). Ca "xóa đến trước tạo" vẫn là gap `COMMENT-DELETE-BEFORE-CREATE`.

## Đề xuất thay đổi

Không có (đã được phép sửa FR-048, docs/10).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking
