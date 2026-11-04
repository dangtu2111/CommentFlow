# Kế hoạch `feat/comment-sync` — đồng bộ bình luận bị khách sửa/xóa (COMMENT-EDIT-DELETE)

## Việc

Mã MASTER: `COMMENT-EDIT-DELETE` · FR-048 (bình luận bị khách sửa → cập nhật; bị xóa → ẩn khỏi inbox, giữ log) · Spec: `docs/12` §1 (webhook `feed`, `verb = edited`/`remove`), `docs/09` §6.1 R2 (chưa xóa/ẩn trên nền tảng), ADR 007/008; tiếp nối `WH-INGEST` (hiện sự kiện sửa/xóa chỉ được đánh dấu xong).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Khi khách sửa nội dung bình luận trên Facebook, hệ thống cập nhật nội dung trong inbox; khi khách xóa, bình luận biến mất khỏi danh sách (vẫn giữ trong DB và nhật ký) và không thể trả lời nữa — nếu đang có yêu cầu gửi chờ thì job gửi tự hủy. Cần một cột mới `comments.deleted_at` (migration 0024) và siết trigger để người dùng không tự đặt/gỡ cột này. Rủi ro thấp–vừa vì đổi hàm DB trả lời (thêm điều kiện "chưa xóa").

## Điểm chưa rõ

Không có. Quyết định theo spec (không bịa):
1. **Xóa = đặt `deleted_at`** (không xóa dòng: giữ log theo spec). Chỉ đường hệ thống ghi (worker); trigger chặn người dùng đổi `deleted_at`. Inbox (danh sách, số lượng tab) bỏ bình luận đã xóa; mở trực tiếp bằng `?c=` vẫn xem được kèm thông báo "đã bị xóa trên nền tảng" và không cho trả lời.
2. **Sửa = cập nhật `text`** (hệ thống ghi; `text_normalized` về NULL để chuẩn hóa lại sau); ghi `action_logs` (`comment.edited`, KHÔNG kèm nội dung cũ/mới). "Phân loại lại nếu chưa trả lời" chưa làm (chưa có phân loại — gap `PIPE-*`): hiện chỉ cập nhật nội dung. Bình luận do chính Page viết (`is_own`) hoặc chưa có trong DB → bỏ qua (done).
3. **Chống nuốt lần sửa thứ hai:** sự kiện `edited`/`remove` mang thêm `occurredAt` (= `entry.time` của Meta, giây) vào `NormalizedEvent`; `event_hash` của sửa/xóa dùng `occurredAt` (không dùng thời gian tạo bình luận) → mỗi lần sửa là một sự kiện riêng, Meta gửi lại cùng payload vẫn trùng hash (idempotent). Thiếu `entry.time` → rơi về cách cũ.
4. **Gửi đang chờ:** `request_comment_reply` từ chối bình luận đã xóa (CF409); job `send` thêm điều kiện R2 (`deleted_at`) → hủy `recheck:R2`.
5. Chưa làm (gap): đồng bộ "ẩn" (`verb = hide`, `FB-HIDE`), phân loại lại sau khi sửa, lưu lịch sử các bản sửa.

## Tiêu chí nghiệm thu

1. `parseMetaWebhook`: `edited`/`remove` có `occurredAt` từ `entry.time` (Date), thiếu → không có; `eventHashOf`: hai lần sửa cùng bình luận khác `entry.time` → hash khác, cùng `entry.time` → cùng hash; `created` không đổi; `serializeEvent`/`deserializeEvent` khứ hồi giữ `occurredAt` — test đơn vị.
2. Migration 0024: `comments.deleted_at timestamptz`; `cf_app` được UPDATE cột này (đường hệ thống dùng) nhưng trigger `guard_comment_user_update` (thay bản 0023) chặn người dùng đổi nó; `cf.request_comment_reply` (thay bản 0023) từ chối bình luận đã xóa (`CF409`) — test tích hợp (người dùng không đặt/gỡ `deleted_at`; không trả lời được bình luận đã xóa; các điều kiện cũ vẫn đúng).
3. Worker `ingest`: `comment_edited` → cập nhật `text` (và `text_normalized = NULL`) chỉ khi bình luận tồn tại, không `is_own`, nội dung thật sự đổi; ghi `action_logs` không kèm nội dung; sự kiện xong (`done`); `comment_deleted` → đặt `deleted_at` một lần (chạy lại không đổi giờ), `action_logs` `comment.deleted`; bình luận không tồn tại → `done` êm; sửa lần hai (hash khác) áp dụng; kênh không `connected` vẫn đồng bộ (sửa/xóa là dữ liệu, không phải gửi) — test tích hợp worker.
4. `listComments`/`countCommentsByTab` bỏ bình luận `deleted_at IS NOT NULL` (số tab khớp danh sách); `getCommentDetail` trả `deletedAt`; `deriveReplyUi` thêm chế độ chặn `deleted` (ưu tiên cao nhất); panel hiện "Bình luận đã bị xóa trên nền tảng" — test tích hợp + đơn vị + i18n vi/en.
5. Job `send` R2: bình luận `deleted_at` khác NULL → yêu cầu hủy `recheck:R2`, không gọi connector, bình luận trả về trạng thái trước — test tích hợp worker.
6. **Kiểm chứng độc lập một lần cuối nhánh** (`verifier-db`, Opus): migration thay hàm DEFINER + trigger.
7. Công cụ xanh (đọc mã thoát): lint, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test, test:trace (FR-048 có test), test:coverage, `test:db`, `db:check-rls`, `next build`.

## File sẽ đọc (đã đọc) / sửa

Đọc: `docs/05` FR-048, `docs/12` §1, ADR 007/008, `packages/connectors/src/{types,facebook/webhook}.ts`, `apps/worker/src/jobs/{ingest,send}.ts`, `packages/db/migrations/0023_comment_replies.sql`, `packages/db/src/queries/{inbox,comment-detail}.ts`, `apps/web/src/lib/reply-state.ts`.
Tạo/sửa: `packages/connectors/src/{types,facebook/webhook}.ts` (+ test); `packages/db/migrations/0024_comment_deleted_at.sql` (+ `meta/`), `schema/cf/comments.ts`, `src/queries/{inbox,comment-detail}.ts`, `src/check-rls.ts` (+ test), `tests/comment-sync.int.test.ts`, sửa `tests/inbox.int.test.ts`/`comment-replies.int.test.ts` nếu cần; `apps/worker/src/jobs/{ingest,send}.ts` (+ `tests/ingest.int.test.ts`, `tests/send.int.test.ts`); `apps/web/src/lib/reply-state.ts` (+ test), `components/comments/comment-detail.tsx`, messages vi/en; `docs/testing/KIEM_TRA_TAY.md` (KT-008), `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/10` (thêm cột `deleted_at`, mô tả trigger — theo cho phép sửa `docs/10` §3.2/§4 cho bảng bình luận/replies; ghi lại nội dung đã đổi).

## Migration

`0024_comment_deleted_at.sql`: `ALTER TABLE cf.comments ADD COLUMN deleted_at timestamptz`; `GRANT UPDATE (deleted_at) ON cf.comments TO cf_app`; `CREATE OR REPLACE FUNCTION cf.guard_comment_user_update()` (bản 0023 + chặn đổi `deleted_at` ở đường người dùng); `CREATE OR REPLACE FUNCTION cf.request_comment_reply(uuid, text)` (bản 0023 + `deleted_at IS NOT NULL` → `CF409`). Đường lùi (comment cuối file): khôi phục hai hàm bản 0023, `DROP COLUMN deleted_at`. Tương thích ngược: cột nullable mới; hàm chỉ chặt hơn.

## Test viết trước

Tiêu chí 1–5. Lệnh hẹp: `pnpm --filter @flow/connectors test` · `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/comment-sync.int.test.ts tests/inbox.int.test.ts tests/comment-replies.int.test.ts tests/check-rls.int.test.ts` · `pnpm --filter @flow/worker exec vitest run --config vitest.int.config.ts tests/ingest.int.test.ts tests/send.int.test.ts` · `pnpm db:migrate && pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

**Có — `verifier-db` một lần cuối nhánh** (thay hàm DEFINER + trigger + cột mới). Không cần verifier-security riêng (không đổi quyền ghi của người dùng ngoài việc chặn thêm một cột).

## Rủi ro / câu hỏi

Chưa kiểm với webhook sửa/xóa thật của Meta (fixture mô phỏng theo tài liệu); bước kiểm tay với Page thử sau `FB-OAUTH` (KT-008). Việc có migration → nhánh này giữ "suất migration" hiện tại.

## Đề xuất thay đổi

`docs/10` §3.2 (cột `comments.deleted_at`) và §4 (mô tả trigger): sửa theo cho phép của chủ dự án (06/11/2026) cho nhóm bảng bình luận/trả lời; báo lại nội dung.

## Complexity tracking

Thay hai hàm DEFINER đã có (không thêm hàm mới).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời
- [x] Mỗi tiêu chí nghiệm thu kiểm được
- [x] Logic quy tắc có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (verifier-db)
- [x] Không thư viện mới
- [x] Danh sách file đủ
- [x] Không bảng mới (chỉ cột `deleted_at`; quyền cột: cf_app UPDATE `deleted_at`, trigger chặn người dùng)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt theo `docs/PROMPT_BUILD_TOAN_BO.md` §2; chủ dự án giao 06/11/2026 làm COMMENT-EDIT-DELETE).
