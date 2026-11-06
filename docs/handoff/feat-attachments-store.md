# Bàn giao `feat-attachments-store` (agent: claude, làn b)

## Đã làm
- `packages/connectors/src/attachments.ts` (+ test): kiểu `CommentAttachment`, `normalizeAttachments` (https ≤ 2048, ≤ 10, bỏ trùng, làm sạch), `webhookAttachments`, `facebookGraphAttachment`, `withAttachments`; export ở `index.ts`.
- `NormalizedComment.attachments?`; webhook đọc `photo`/`video`, serialize/deserialize giữ tệp; Graph lấy `attachment{type,url,media,target}`.
- Worker `ingest.ts` ghi `comments.attachments` (chỉ khi tạo; sửa bình luận không đổi tệp — Q-ATT1).
- Migration `0036_comment_attachments_check.sql`: CHECK mảng ≤ 10 (`comments_attachments_shape_check`) + schema Drizzle + snapshot.
- Docs: plan, Q-ATT1, docs/10, gap-matrix, MASTER, KT-023, codemap.

## File đã đọc + điều rút ra
`webhook.ts`/`connector.ts` (chuẩn hóa + storedCommentSchema phải thêm trường mới), `ingest.ts` (insert ở một chỗ), `comments.ts` (cột đã có từ 0019; không mã nào ghi trước đây).

## Chưa làm / còn lại
- `CF_LANE=b pnpm test:db` + `db:check-rls` KHÔNG chạy được ở phiên này (worktree không có `.env`, agent không được tạo) → người điều phối/CI chạy trước khi merge. Test mới: `ingest.int.test.ts` (FR-143), `ch-schema.int.test.ts` (CHECK).
- Việc sau: `DA-HANDOFF-RULES` (chuyển người khi câu phụ thuộc ảnh), UI biểu tượng/xem trước, `ATTACH-VISION`.
