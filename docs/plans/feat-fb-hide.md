# Kế hoạch `feat/fb-hide` — Ẩn / bỏ ẩn bình luận (FB-HIDE)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định nằm trong FR-044, docs/08 nguyên tắc 6 "ẩn ↔ bỏ ẩn, không có xóa", nguyên tắc bất biến #3 "AI không bao giờ tự ẩn", và mẫu ADR 008; không có điểm chưa rõ).

## Việc

Mã gap matrix: `FB-HIDE` (đóng thêm phần `is_hidden` của `COMMENT-HIDE-MERGE-GUARD`) · Spec: FR-044, docs/05, docs/08 §nguyên tắc 6, docs/09 §6.1/§9, docs/10 `comments`, ADR 008 (mẫu), ADR 009 mới.

**Tóm tắt (2–3 câu):** Nhân viên bấm "Ẩn" hoặc "Bỏ ẩn" ở chi tiết bình luận; hệ thống ghi một yêu cầu vào hàng đợi (outbox), worker gọi nền tảng (Facebook/Instagram) rồi mới cập nhật "đã ẩn" trong CommentFlow — nên giao diện không bao giờ nói "đã ẩn" khi nền tảng chưa xác nhận. Người dùng không còn tự sửa được cờ `is_hidden` bằng tay (đóng nửa gap `COMMENT-HIDE-MERGE-GUARD`); AI không có đường nào tự ẩn. Rủi ro: chưa có connector Facebook thật (sổ connector rỗng) nên chỉ kiểm được bằng connector giả; thử với Page thật ở bước staging.

## Điểm chưa rõ

Không có. Các điểm đã tự chốt theo spec:
- Tab "Đã ẩn" của inbox đã có sẵn (`status = 'hidden'`); bình luận đã ẩn nằm trong tab "Đã ẩn" và "Tất cả", rời khỏi tab cũ. Bỏ ẩn → trả về trạng thái trước khi ẩn.
- Ẩn/bỏ ẩn một bình luận **không** có hộp xác nhận (hành động đảo ngược được — docs/08 nguyên tắc 6). Hộp xác nhận chỉ cho **Ẩn hàng loạt** (FR-045, việc `BULK-ACTIONS`).
- `merged_into_id` (gộp bình luận): ngoài phạm vi; phần gộp của `COMMENT-HIDE-MERGE-GUARD` còn mở cho việc gộp.

## Tiêu chí nghiệm thu

1. Owner/Staff đang hoạt động gọi `cf.request_comment_hide` (hide/unhide) tạo đúng một yêu cầu `queued`; suspended/removed/người ngoài/ngữ cảnh trần/job/hệ thống bị `42501`, không đổi gì — kiểm bằng: `packages/db/tests/comment-hides.int.test.ts`.
2. Từ chối đúng mã: không thấy/workspace khác `CF404`; trạng thái không ẩn được/đã xóa/đã gộp/đang có yêu cầu trái chiều/đang có yêu cầu trả lời `CF409`; người khác giữ khóa `CF423`; kênh không connected `CF424` — kiểm bằng: cùng file test.
3. Idempotent: ẩn khi đã ẩn, bỏ ẩn khi chưa ẩn, hoặc ẩn lần hai khi đã có yêu cầu ẩn đang chạy → trả `NULL`, không tạo dòng mới; hai lệnh song song → đúng một yêu cầu — kiểm bằng: test DB.
4. Bảng `cf.comment_hides`: `cf_app` không INSERT/DELETE ở mọi ngữ cảnh; người dùng không UPDATE; chỉ hệ thống cập nhật cột kết quả; thành viên chỉ đọc workspace mình — kiểm bằng: test DB + `pnpm db:check-rls`.
5. Người dùng không sửa được `comments.is_hidden` trực tiếp (kể cả đặt true/false); worker (hệ thống) sửa được; các test ch-rls/inbox/reply hiện có vẫn xanh — kiểm bằng: test DB.
6. Hủy (`cf.cancel_comment_hide`): chỉ người yêu cầu, chỉ khi còn `queued`; không đổi trạng thái bình luận — kiểm bằng: test DB.
7. Job `hide` (connector giả): gọi `setHidden(kênh không bí mật, mã ngoài, true|false)` đúng một lần; thành công → `is_hidden`/`status='hidden'` (bỏ ẩn → trạng thái trước) + outbox `done` + action_logs không nội dung; kiểm lại trước khi gọi (xóa/gộp/kênh mất kết nối/đã đổi trạng thái) → hủy/thất bại đúng mã, KHÔNG gọi connector — kiểm bằng: `apps/worker/tests/hide.int.test.ts`.
8. Lỗi connector: `TOKEN_EXPIRED`/`PERMISSION` → `failed` + kênh `expired`/`revoked`; `RATE_LIMIT`/`UNKNOWN` → thử lại, hết lượt → `failed`; connector thiếu → `connector_unavailable`; capability không hỗ trợ → `ACTION_UNSUPPORTED`; bình luận KHÔNG đổi khi thất bại; log/lỗi không chứa token/nội dung — kiểm bằng: test worker.
9. Job chạy quá thuê bị job khác tiếp quản không ghi đè (rào `attempts`); hai job song song chỉ gọi connector một lần — kiểm bằng: test worker.
10. Server action: kiểm UUID, đẩy job; đẩy lỗi → bù hủy; từ chối nghiệp vụ trả mã có kiểu — kiểm bằng: `apps/web/src/server/hide-action.test.ts`.
11. Giao diện: nút "Ẩn" (hoặc "Bỏ ẩn" khi đã ẩn) ở chi tiết; đang xử lý → trạng thái "Đang ẩn…"; lỗi → lý do dễ hiểu + "Thử lại"; chuỗi vi/en đủ, `pnpm lint:i18n` xanh — kiểm bằng: unit test `hide-state`/`hide-errors` + `lint:i18n` + KT-009 (cần Page thật cho bước cuối).
12. Công cụ xanh: biome, lint, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test, test:trace, test:coverage, db:check-rls, build web, test:db của db/saas-core/worker.

## File sẽ đọc (≤ ~8, kèm lý do)

`docs/decisions/008*` + `0023` + `replies.ts` + `jobs/send.ts` + `reply-action.ts` + `reply-{state,errors}.ts` + `comment-detail.tsx` + `queries/comment-detail.ts` (mẫu đã đọc, chép phong cách).

## File sẽ sửa / tạo

Migration `0027_comment_hides.sql`; `packages/db/src/schema/cf/{comment-hides,index}.ts`; `packages/db/src/{hides,runtime,index,check-rls}.ts`; `packages/db/src/queries/comment-detail.ts`; `packages/shared/src/{queues,index}.ts`; `apps/worker/src/{queue/definitions,main}.ts`, `apps/worker/src/jobs/hide.ts`; web: `server/hide-action.ts`, `lib/hide-{state,errors}.ts`, `components/comments/{comment-detail,hide-button}.tsx`, `comments/actions.ts`, messages vi/en, CSS nhỏ; tests db/worker/web/shared; docs: ADR 009, docs/10 (§3.2 + §4 chỉ phần comment_hides/is_hidden), codemap, gap-matrix, MASTER, KIEM_TRA_TAY.

## Migration

`0027_comment_hides.sql` (drizzle-kit + phần viết tay): bảng `cf.comment_hides` + RLS + grant (SELECT; UPDATE cột kết quả); hàm DEFINER `cf.request_comment_hide(uuid, boolean)` và `cf.cancel_comment_hide(uuid)`; `CREATE OR REPLACE cf.request_comment_reply` (thêm: từ chối khi có yêu cầu ẩn đang chạy, CF409); `CREATE OR REPLACE cf.guard_comment_user_update` (thêm: người dùng không đổi `is_hidden`). Đường lùi: khôi phục hai hàm bản 0024/0025; DROP hai hàm hide; DROP TABLE `cf.comment_hides`.

## Test viết trước

DB int (RLS, hàm, trigger, quyền, chéo workspace, idempotent, race); worker int với connector giả; unit web (hide-action, hide-state, hide-errors); queues schema.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run tests/comment-hides.int.test.ts` (qua `test:db`), `pnpm --filter @flow/worker test:db`, `pnpm --filter @flow/web exec vitest run src/server/hide-action.test.ts src/lib/hide-*.test.ts`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration/RLS) và `verifier-security` (cổng ẩn, kiểm lại trước khi gọi nền tảng); phiên chính gọi sau.

## Rủi ro / câu hỏi cho chủ dự án

Thử đầu-cuối cần connector Facebook thật (`feat/fb-connector`) và Page thử; bỏ ẩn Instagram/Facebook cần đối chiếu tài liệu (`declarations.ts` ghi chú).

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking
