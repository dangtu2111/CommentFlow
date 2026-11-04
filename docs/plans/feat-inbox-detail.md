# Kế hoạch `feat/inbox-detail` — chi tiết bình luận + khóa mềm (INBOX-DETAIL-LOCK)

## Việc

Mã MASTER: `INBOX-DETAIL-LOCK` · FR-041 (khóa mềm khi mở bình luận, cảnh báo người thứ hai), US-013 · Spec: `docs/11` §5 (`POST/DELETE /comments/:id/lock`: khóa mềm 2 phút, gia hạn khi gõ, người khác giữ → 409), `docs/08` §1 mục 5 ("An đang xử lý"), `docs/07` UF-3 bước 2–3, thiết kế `comments.png` (cột phải).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Bấm một bình luận ở danh sách thì cột phải hiện chi tiết (người viết, kênh, thời gian, nội dung đầy đủ, trạng thái) và tự **khóa mềm 2 phút** (gia hạn khi còn mở) để đồng nghiệp thấy "đang được <tên> xử lý" và không trả lời trùng; đóng/chuyển bình luận thì mở khóa, bỏ quên thì tự hết hạn. Chỉ hiển thị dữ liệu thật (bài viết chỉ có mã ngoài/cờ quảng cáo, chưa có nội dung bài/sản phẩm/gợi ý AI). Khóa là **cảnh báo mềm**, không phải quyền: việc chặn gửi trùng thật sự do `sendRecheck` ở `FB-REPLY`.

## Điểm chưa rõ

Không có. Quyết định theo spec:
1. TTL 120 giây (docs/11), gia hạn mỗi 60 giây khi panel còn mở; mở khóa khi đóng/chuyển; tự hết hạn khi bỏ tab.
2. Khóa bằng MỘT câu `UPDATE … WHERE (chưa ai giữ OR đã hết hạn OR chính mình giữ) RETURNING` (nguyên tử theo DB, giờ theo `now()` của DB); không cần migration — cột `locked_by/locked_until` đã có và trigger 0019 đã ép `locked_by` phải là chính người gọi hoặc NULL.
3. Người khác giữ khóa → panel hiện cảnh báo "Đang được <tên> xử lý (còn ~N giây)" và chế độ chỉ xem; danh sách hiện chip "<tên> đang xử lý" (chỉ khi khóa còn hạn và không phải mình).
4. Chọn bình luận bằng tham số URL `c=<uuid>` (liên kết thật, chia sẻ được, back/forward chạy đúng); đổi tab/lọc thì bỏ chọn.
5. Chưa dựng (ghi gap, không bịa): bối cảnh bài + sản phẩm gắn (cần `POST-HYDRATE`/`posts-products`), nhãn + độ tin cậy + lý do AI, gợi ý AI + chip nguồn, tự mở bình luận kế tiếp, hành động Gửi/Ẩn/Bỏ qua (làm ở `FB-REPLY`/`FB-HIDE`/…), "Khách tiềm năng"/ngữ cảnh khách, đính kèm (`ATTACHMENTS-STORE`).

## Tiêu chí nghiệm thu

1. `acquireCommentLock(tx, ws, commentId, userId)` (`packages/db/src/queries/comment-lock.ts`): chưa ai giữ → `acquired` (+`until` = now + 120 giây); chính mình giữ → gia hạn; người khác giữ còn hạn → `held` (+ tên người giữ, `until`), KHÔNG đổi gì; hết hạn → người khác lấy được; bình luận không tồn tại/workspace khác/người ngoài workspace → `not_found` — test tích hợp DB.
2. Hai người lấy khóa cùng lúc → đúng MỘT người thắng (nguyên tử) — test tích hợp (song song).
3. `releaseCommentLock`: chỉ người đang giữ mở được; người khác gọi → không đổi gì; khóa đã hết hạn/không ai giữ → no-op — test tích hợp.
4. `getCommentDetail(tx, ws, id)`: trả đủ trường thật (tác giả, kênh, nền tảng, bài: mã ngoài + cờ quảng cáo, thời gian, văn bản đầy đủ, trạng thái, nhãn, bình luận cha, người giữ khóa + hạn) và `null` cho id workspace khác/người ngoài — test tích hợp. `listComments` có thêm `lockedBy` (tên) + `lockedUntil` để hiện chip "đang xử lý" khi còn hạn.
5. Server Action `lockCommentAction`/`unlockCommentAction`: gọi `requireAppUser` (test quét hiện có), kiểm UUID, chỉ dùng workspace/người từ phiên; kết quả có kiểu (`acquired|held|not_found`) — test đơn vị (hàm phân loại kết quả) + test quét.
6. Panel chi tiết (Server Component + một Client Component `CommentLock` gọi action khi mở, gia hạn mỗi 60 giây, mở khóa khi đóng): hiển thị đúng nội dung (văn bản thuần, không HTML), trạng thái, cảnh báo khi người khác giữ, trạng thái rỗng khi chưa chọn hoặc id không hợp lệ/không thấy ("Không tìm thấy bình luận") — build + test đơn vị phần thuần + kiểm tay (KT-005).
7. `parseInboxSearchParams`/`buildInboxHref` hỗ trợ `c` (UUID hợp lệ mới nhận); đổi tab/lọc bỏ `c`; phân trang giữ `c` — test đơn vị.
8. vi + en đủ khóa; màu/chữ từ token; mobile: panel chi tiết xuống dưới danh sách — lint:i18n + build + kiểm tay.
9. Công cụ xanh (đọc mã thoát): lint, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test, test:trace (FR-041 có test), test:coverage, `test:db`, `next build`, `db:check-rls`.

## File sẽ đọc / sửa

Đọc (đã đọc): `docs/11` §5, `docs/08`, `docs/07` UF-3, `0019_ch_schema.sql` (grant + trigger comments), `packages/db/src/queries/inbox.ts`, `apps/web/src/lib/inbox-filters.ts`, `components/comments/*`, `(guarded)/comments/page.tsx`, `server/inbox.ts`, `require-app-user.scan.test.ts`.
Tạo/sửa: `packages/db/src/queries/comment-lock.ts` + `comment-detail.ts` (+ `runtime.ts`), `packages/db/src/queries/inbox.ts` (thêm cột khóa vào danh sách), `packages/db/tests/comment-lock.int.test.ts`; `apps/web/src/lib/inbox-filters.ts` (+ test, tham số `c`), `lib/comment-lock-result.ts` (+ test); `app/app/(guarded)/comments/{page.tsx,actions.ts}`; `components/comments/{comment-detail,comment-lock}.tsx`, `inbox-list.tsx` (liên kết chọn + chip khóa); `server/inbox.ts`; `globals.css`; messages vi/en; `design/stitch/README.md`; `docs/testing/KIEM_TRA_TAY.md` (KT-005); `docs/codemap.md`; `docs/gap-matrix.md`; `docs/plans/MASTER.md`.

## Migration

Không có (cột và trigger đã có; kiểm bằng test).

## Test viết trước

Tiêu chí 1–4, 7. Lệnh: `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/comment-lock.int.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib` · `pnpm --filter @flow/web build`.

## Cần kiểm chứng độc lập không?

Không: không đổi policy/hàm/migration; khóa chỉ là UPDATE có điều kiện đi qua `withActor` + RLS + trigger đã kiểm chứng. Nếu phát hiện cần đổi quyền cột/trigger thì dừng và kiểm chứng.

## Rủi ro

Khóa mềm không chặn được ai (chỉ cảnh báo) — đúng spec; chặn gửi trùng nằm ở `sendRecheck`/khóa chống trùng theo comment (`FB-REPLY`). Mở khóa khi đóng tab phụ thuộc trình duyệt (hết hạn 2 phút bù lại). **Kiểm tra tay:** KT-005 (cần 2 trình duyệt/2 tài khoản).

## Đề xuất thay đổi

Không.

## Complexity tracking

Không đi ngược nguyên tắc nào.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời
- [x] Mỗi tiêu chí nghiệm thu kiểm được
- [x] Logic quy tắc có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (không)
- [x] Không thư viện mới
- [x] Danh sách file đủ
- [x] Không bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt theo `docs/PROMPT_BUILD_TOAN_BO.md` §2; chủ dự án giao 06/11/2026 làm ngay các việc không cần Page thật).
