# Kế hoạch `feat-attachments-store` — Lưu loại + link tệp đính kèm của bình luận

Mã gap matrix: `ATTACHMENTS-STORE` · Spec: FR-143 (docs/05), `comments.attachments` (docs/10), `docs/12` §1.

**Tóm tắt:** Cột `comments.attachments` (jsonb) đã có nhưng không có mã nào ghi vào — ảnh/video/sticker khách gửi kèm bị bỏ. Việc này cho connector Facebook đọc tệp đính kèm (webhook + Graph), worker ingest lưu `[{type, url?, external_id?}]`, và thêm ràng buộc DB (migration 0036) chặn dữ liệu sai dạng. Rủi ro: link ảnh do khách tạo → chỉ nhận `https`, giới hạn độ dài/số lượng; xóa bình luận vẫn xóa trắng như cũ.

## Điểm chưa rõ

Không có. (Quyết định tự chọn: Q-ATT1 trong `QUYET_DINH_CHO_DUYET.md`.)

## Tiêu chí nghiệm thu

1. Webhook `feed` có `photo`/`video` → `NormalizedComment.attachments` đúng loại + link `https`; link không `https`/quá dài bị bỏ — test `webhook.test.ts` (FR-143).
2. Graph `attachment{type,url,media,target}` (photo, video_inline, sticker, animated_image_share) → loại `photo/video/sticker/gif`; loại khác (share…) bị bỏ — test `connector.test.ts` (FR-143).
3. Tối đa 10 tệp/bình luận; trùng bị loại — test `attachments.test.ts`.
4. Sự kiện lưu trong `webhook_events.payload` đọc lại (`deserializeEvent`) giữ nguyên tệp đính kèm — test webhook.
5. Ingest ghi `comments.attachments`; bình luận không có tệp → `[]`; chữ vẫn lưu bình thường — test tích hợp `ingest`.
6. DB từ chối `attachments` không phải mảng hoặc > 10 phần tử; các hàm xóa trắng (`'[]'`) vẫn chạy — test tích hợp `packages/db`.
7. Gap matrix/codemap/MASTER cập nhật; `pnpm check:migrations`, `db:check-rls` đạt.

## File sẽ đọc

`docs/codemap.md` (đã), `packages/connectors/src/facebook/webhook.ts`, `connector.ts` (đã đọc phần liên quan), `apps/worker/src/jobs/ingest.ts`, `packages/db/src/schema/cf/comments.ts`.

## File sẽ sửa / tạo

- `packages/connectors/src/attachments.ts` (+ test): kiểu `CommentAttachment`, hàm làm sạch/giới hạn.
- `packages/connectors/src/types.ts`, `index.ts`: thêm `attachments?` vào `NormalizedComment`, export.
- `packages/connectors/src/facebook/webhook.ts`, `connector.ts` (+ test, fixtures): đọc tệp.
- `apps/worker/src/jobs/ingest.ts` (+ test tích hợp): ghi cột.
- `packages/db/src/schema/cf/comments.ts`, `migrations/0036_comment_attachments_check.sql` (+ meta): ràng buộc CHECK.
- docs: gap-matrix, MASTER, codemap, docs/10, KIEM_TRA_TAY, QUYET_DINH, handoff.

## Migration

0036: `ALTER TABLE cf.comments ADD CONSTRAINT comments_attachments_shape_check CHECK (jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments) <= 10)`. Không bảng/policy mới, không đổi quyền. Đường lùi: `ALTER TABLE cf.comments DROP CONSTRAINT comments_attachments_shape_check`.

## Test viết trước

Bộ chuẩn hóa tệp (ca biên: 10/11 tệp, URL http, rỗng, trùng, Unicode) và đọc webhook/Graph — viết đỏ trước.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors test` · `pnpm --filter @flow/connectors test:coverage` · `CF_LANE=b pnpm test:db` · `pnpm check:migrations`.

## Cần kiểm chứng độc lập không?

`verifier-db` một lần (có migration). Không chạm auth/RLS policy/gửi → không cần verifier-security.

## Rủi ro / câu hỏi cho chủ dự án

Link CDN của Meta hết hạn sau một thời gian — lưu link như nhận được; hiển thị ảnh (UI) thuộc việc khác. Sticker/gif Graph có thể không có link → lưu chỉ loại.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

(Không có bảng mới.)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec FR-143/docs-10; lựa chọn nhỏ ghi Q-ATT1).
