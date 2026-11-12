# Kế hoạch `feat/comment-author-avatar` — Ảnh đại diện người bình luận

Mã gap matrix: `COMMENT-AUTHOR-AVATAR` (mới) · Spec: `docs/08_UI_UX_Specification.md` (hộp thư bình luận), `docs/10_Database_Design.md` (comments).

**Tóm tắt:** Trang Bình luận chỉ hiện chữ cái đầu của tên người bình luận vì webhook Facebook không kèm ảnh và bảng `comments` không có chỗ lưu. Sau khi lưu bình luận, worker sẽ gọi Graph API lấy ảnh đại diện của người bình luận, lưu **URL ảnh** vào cột mới, và giao diện hiện ảnh khi có. Facebook có thể không trả ảnh (quyền riêng tư): khi đó giữ chữ cái đầu, không bao giờ bịa. Rủi ro: ảnh cá nhân của khách là dữ liệu cá nhân; URL của Facebook hết hạn.

## Điểm chưa rõ

Không có. Quyết định của chủ dự án (12/11/2026): (1) làm theo phương án đề xuất; (2) **đồng ý lưu URL ảnh** trong DB; (3) viết code trước và dùng log đếm kết quả để biết Facebook có trả ảnh không; (4) không tải file ảnh về lưu riêng ở bước này.

## Tiêu chí nghiệm thu

1. Migration thêm `comments.author_avatar_url` (https, ≤ 2048 ký tự); ghi chỉ qua hàm DEFINER hệ thống; web (`cf_app`) không ghi được — test tích hợp.
2. Bình luận bị xóa (kể cả dấu xóa đến trước) → URL ảnh bị xóa trắng — test tích hợp.
3. Connector: `fetchCommentAuthorPicture` trả URL https khi Facebook trả ảnh thật; trả `null` khi ảnh mặc định (`is_silhouette`), thiếu, hoặc không phải https — test với `fetch` giả.
4. Worker: sau khi lưu bình luận mới (không phải của Page), gọi lấy ảnh MỘT lần, best-effort: lỗi chỉ ghi cảnh báo kèm mã, không làm hỏng ingest, không log URL/tên — test.
5. Giao diện: hộp thư và chi tiết bình luận hiện `<img>` khi có URL https hợp lệ, còn lại hiện chữ cái đầu — test render.
6. Log tổng hợp đếm: số lần có ảnh / ảnh mặc định / không trả — để biết khả thi thật với Facebook.

## File sẽ đọc

`apps/worker/src/jobs/ingest.ts`, `apps/worker/src/jobs/post-hydrate.ts`, `apps/worker/src/main.ts` (đã đọc: hook hydrate sau commit); `packages/connectors/src/facebook/connector.ts` (`fetchPost` làm mẫu); `packages/db/src/queries/inbox.ts`, `comment-detail.ts`; `apps/web/src/components/ui/avatar.tsx`, `comments/inbox-list.tsx`, `comments/comment-detail.tsx`.

## File sẽ sửa / tạo

- `packages/db/migrations/0089_comment_author_avatar.sql` (+ journal) — cột, CHECK, hàm DEFINER `cf.set_comment_author_avatar`, trigger xóa ảnh khi bình luận đã xóa.
- `packages/db/src/queries/comment-avatar.ts`, `runtime.ts`, `inbox.ts`, `comment-detail.ts`.
- `packages/connectors/src/facebook/connector.ts` (+ kiểu) — `fetchCommentAuthorPicture`.
- `apps/worker/src/jobs/comment-avatar.ts`, `ingest.ts`, `main.ts`.
- `apps/web/src/components/ui/avatar.tsx`, `comments/inbox-list.tsx`, `comments/comment-detail.tsx`, test.

## Migration

`0089` — **chỉ thêm** cột nullable + CHECK + hàm + trigger. Đường lùi: `DROP TRIGGER`, `DROP FUNCTION cf.set_comment_author_avatar`, `ALTER TABLE cf.comments DROP COLUMN author_avatar_url`.

## Test viết trước

Hàm DB (quyền, xóa khi bình luận xóa), connector (ảnh thật/ảnh mặc định/thiếu/URL lạ), hydrator worker (best-effort, không log dữ liệu), render Avatar.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/facebook`; `pnpm --filter @flow/worker exec vitest run src/jobs`; `cd packages/db && pnpm exec vitest run --config vitest.int.config.ts tests/comment-avatar.int.test.ts`; `pnpm --filter @flow/web exec vitest run src/components`.

## Cần kiểm chứng độc lập không?

Có (dữ liệu cá nhân của khách + migration). Phiên tự kiểm theo `docs/workflows/verify.md`, gắn nhãn "tự kiểm", không tự merge.

## Rủi ro / câu hỏi cho chủ dự án

- Facebook có thể không trả ảnh người bình luận cho app (quyền riêng tư); khi đó tính năng không có tác dụng — log sẽ cho biết.
- URL ảnh hết hạn sau một thời gian; ảnh cũ có thể hỏng về sau (giai đoạn sau: làm mới hoặc lưu file riêng).
- CSP `img-src` đã có CDN Facebook (PR #350).

## Đề xuất thay đổi

Ghi cột mới vào `docs/10_Database_Design.md` sau khi duyệt.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking (không có thư viện mới)
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới (thêm cột; ghi qua hàm DEFINER chỉ hệ thống)

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 12/11/2026).
