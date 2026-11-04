# Kế hoạch `feat/reply-ui` — hộp soạn trả lời + Gửi + Thử lại trong panel chi tiết (FB-REPLY giao diện, FB-RETRY-UI)

## Việc

Mã MASTER: `FB-REPLY` (giao diện), `FB-RETRY-UI` · FR-042 (gửi trả lời; thành công → "Đã trả lời"; lỗi → "Gửi lỗi" + lý do dễ hiểu + Thử lại), US-011 (Ctrl/⌘+Enter), US-016 · Spec: `docs/07` UF-3 bước 4–5, `docs/08` (ReplyComposer, microcopy), `docs/11` §5 (`POST /comments/:id/reply` → 202 sending), ADR 008.

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Trong panel chi tiết bình luận thêm hộp soạn câu trả lời và nút **Gửi** (Ctrl/⌘+Enter). Bấm Gửi → hệ thống ghi yêu cầu vào hàng đợi gửi (hàm DB đã kiểm chứng ở `feat/reply-backend`) và đẩy job `send`; panel tự làm tươi hiển thị "Đang gửi…" rồi "Đã trả lời" hoặc "Gửi lỗi" kèm lý do dễ hiểu và nút **Thử lại**. Hiện chưa có connector Facebook thật nên khi chạy thật job sẽ báo "chưa kết nối được nền tảng" — giao diện và luồng đã đủ để thử bằng dữ liệu giả.

## Điểm chưa rõ

Không có. Quyết định theo spec/ADR (không bịa):
1. Hộp soạn chỉ hiện khi bình luận trả lời được (trạng thái `new`/`pending_review`/`needs_human`/`send_failed`, chưa trả lời/ẩn/gộp, kênh `connected`, không ai khác giữ khóa); ngược lại hiện lý do (đang được người khác xử lý; kênh cần kết nối lại; đã trả lời; đã ẩn…).
2. Server Action `replyCommentAction(commentId, text)`: `requireAppUser`, kiểm UUID + nội dung (cắt khoảng trắng, 1–8000 ký tự) → `requestCommentReply` trong `withActor` → đẩy job `send` (pg-boss; dùng chung runtime queue của web) → trả kết quả có kiểu. Lý do từ chối ánh xạ `ReplyRejection` → thông báo (không lộ chi tiết kỹ thuật). **Đẩy job lỗi** → gọi `cancelCommentReply` (bù, bình luận về trạng thái trước) rồi báo "chưa gửi được, thử lại".
3. Hiển thị trạng thái gửi từ dữ liệu thật: `comment_replies` mới nhất của bình luận (trạng thái, mã lỗi, nội dung, thời điểm gửi). Làm tươi: client gọi `router.refresh()` mỗi 3 giây khi `sending`/`queued` (dừng sau 2 phút → hiện "Đang chờ xử lý lâu, thử tải lại").
4. Lý do lỗi dễ hiểu theo mã (`error_code`): `TOKEN_EXPIRED`, `PERMISSION`, `BLOCKED`, `RATE_LIMIT`, `UNKNOWN`, `recheck:R1`/`R2`/`R3`, `connector_unavailable`, `ACTION_UNSUPPORTED`, `WINDOW_EXPIRED`, `TEXT_TOO_LONG`, `retries_exhausted`; mã lạ → thông báo chung. Nút **Thử lại** chỉ khi `send_failed`, điền sẵn câu cũ.
5. Chưa dựng (ghi gap): gợi ý AI/sửa gợi ý (`drafts`, FR-043), phím tắt H/E/M và tự mở bình luận kế tiếp, nhắn riêng, Ẩn/Bỏ qua (nhánh `FB-HIDE`/skip), `PriceChangedDialog`, đổi nhãn.

## Tiêu chí nghiệm thu

1. `getCommentDetail` bổ sung `channelStatus` và `latestReply` (id, trạng thái, nội dung, mã lỗi, thời điểm gửi) của yêu cầu mới nhất; người ngoài/workspace khác vẫn `null` — test tích hợp DB.
2. `deriveReplyUi(detail, viewer)` (`apps/web/src/lib/reply-state.ts`, thuần) trả đúng chế độ: `compose` | `sending` | `sent` | `failed` (kèm mã lỗi) | `blocked` (kèm lý do: `locked_by_other`, `channel_unavailable`, `not_replyable`) — bảng test đơn vị cho mọi trạng thái bình luận × kênh × khóa × yêu cầu gần nhất.
3. `replyErrorKey(code)` (thuần): ánh xạ mọi mã ở điểm 4 → khóa i18n; mã lạ/`null` → khóa chung; không bao giờ trả chuỗi có nội dung người dùng — test đơn vị.
4. `parseReplyText(raw)` (thuần): cắt khoảng trắng, từ chối rỗng/quá 8000; chuẩn hóa xuống dòng — test đơn vị (bảng + property không ném).
5. Server Action: gọi `requireAppUser` (test quét hiện có), kiểm đầu vào, ánh xạ `ReplyRejectedError` → kết quả có kiểu, đẩy job; đẩy lỗi → bù hủy — test đơn vị với phụ thuộc được tiêm (`createReplyAction(deps)`); logic DB đã có test ở backend.
6. Thành phần `ReplyComposer` (client): textarea có nhãn, đếm ký tự, Ctrl/⌘+Enter gửi, khóa nút khi đang gửi (chống bấm đúp), hiện lỗi dễ hiểu, làm tươi khi `sending`; vi + en đủ khóa; mobile không tràn — build + `lint:i18n` + kiểm tay (KT-007).
7. Không lộ nội dung/mã kỹ thuật ra log phía web; `error_code` hiển thị là thông báo đã dịch, không phải mã thô.
8. Công cụ xanh (đọc mã thoát): lint, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test, test:trace (FR-042 có test), test:coverage, `test:db`, `next build`, `db:check-rls`.

## File sẽ đọc (đã đọc) / sửa

Đọc: `docs/07` UF-3, `docs/08`, `docs/11` §5, ADR 008, `packages/db/src/{replies,queries/comment-detail}.ts`, `apps/web/src/{server/webhook-runtime,app/app/(guarded)/comments/actions,components/comments/comment-detail}.tsx`, `lib/comment-lock-result.ts`.
Tạo/sửa: `packages/db/src/queries/comment-detail.ts` (+ test trong `comment-lock.int.test.ts`), `apps/web/src/lib/{reply-state,reply-errors,reply-input}.ts` (+ test), `server/queue.ts` (runtime pg-boss dùng chung, `webhook-runtime.ts` dùng lại), `server/reply-action.ts` (+ test), `(guarded)/comments/actions.ts` (thêm `replyCommentAction`), `components/comments/{reply-composer,comment-detail}.tsx`, `globals.css`, messages vi/en, `docs/testing/KIEM_TRA_TAY.md` (KT-007), `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`.

## Migration

Không có.

## Test viết trước

Tiêu chí 1–5. Lệnh: `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/comment-lock.int.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib src/server` · `pnpm --filter @flow/web build`.

## Cần kiểm chứng độc lập không?

Không: giao diện + Server Action mỏng gọi hàm DB/job đã được kiểm chứng ở `feat/reply-backend`; không đổi policy/hàm/migration. (Action tự gọi `requireAppUser`; quyền thật do hàm DB quyết định.)

## Rủi ro / câu hỏi

Chưa có connector Facebook thật → thử đầu-cuối chỉ bằng dữ liệu giả cho tới `feat/fb-connector`. **Kiểm tra tay:** KT-007 (vi + en).

## Đề xuất thay đổi

Không.

## Complexity tracking

Không đi ngược nguyên tắc nào.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời
- [x] Mỗi tiêu chí nghiệm thu kiểm được
- [x] Logic quy tắc có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (không — dùng hàm đã kiểm chứng)
- [x] Không thư viện mới
- [x] Danh sách file đủ
- [x] Không bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt theo `docs/PROMPT_BUILD_TOAN_BO.md` §2; chủ dự án giao 06/11/2026: ưu tiên reply-ui).
