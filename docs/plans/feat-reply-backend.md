# Kế hoạch `feat/reply-backend` — trả lời bình luận tay: outbox + job `send` + `sendRecheck` (FB-REPLY, phần backend)

## Việc

Mã MASTER: `FB-REPLY` (phần backend; giao diện ở nhánh `feat/reply-ui`, `FB-RETRY-UI`, `FB-HIDE` làm sau) · FR-042 (gửi trả lời qua API: thành công → "Đã trả lời" + `external_reply_id`; lỗi → "Gửi lỗi" + lý do; timeout → kiểm tra trước khi cho thử lại), FR-016 (khai báo khả năng), `COMMENTS-STATUS-GUARD` · Spec: `docs/09` §6.1 (`sendRecheck` R1–R3, R9), §9 (hàng đợi `send`: 3/kênh, thử lại 3, backoff), `docs/12` §1, §9 (lỗi chuẩn hóa → hành động), `docs/13` §3.1/§5, ADR 005/007.

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Khi nhân viên bấm Gửi, hệ thống ghi một "yêu cầu trả lời" (hàng đợi gửi) bằng hàm DB hẹp có kiểm tra (đúng trạng thái, không ai khác đang giữ khóa, kênh còn kết nối), rồi worker chạy job `send`: kiểm lại mọi điều kiện ngay trước khi gửi (`sendRecheck`), gọi connector nền tảng bằng token đã giải mã, rồi ghi kết quả (Đã trả lời / Gửi lỗi + lý do, đánh dấu kênh hết hạn/bị thu hồi). Đây là phần nhạy cảm nhất của GĐ1 (dùng token, gửi nội dung ra ngoài, chống gửi trùng) nên có kiểm chứng độc lập; giao diện bấm Gửi và connector Facebook thật làm ở nhánh sau (hiện test bằng connector giả).

## Điểm chưa rõ

Không có. Quyết định thiết kế (theo spec/ADR; ghi ADR 008):
1. **Bảng outbox `cf.comment_replies`** (không có trong docs/10; `drafts` của AI chưa dựng và gắn với gợi ý AI): `workspace_id`, `channel_id`, `comment_id`, `text`, `requested_by`, `status` (`queued`/`sending`/`sent`/`failed`/`cancelled`), `attempts`, `external_reply_id`, `error_code`, `sent_at`; unique một yêu cầu đang hoạt động cho mỗi bình luận (chống trùng). RLS: thành viên đọc; **không INSERT trực tiếp** (chỉ qua hàm DEFINER); chỉ đường hệ thống cập nhật kết quả. Đề xuất thêm vào `docs/10` §3.2 ghi ở ADR 008 (chưa sửa docs/10 — chờ chủ dự án cho phép). Khi có `drafts` (AI), outbox giữ vai trò hàng đợi gửi.
2. **`cf.request_comment_reply(comment_id, text)`** (DEFINER, `withActor`): người gọi là thành viên đang hoạt động; bình luận tồn tại, chưa gộp/ẩn/trả lời (`external_reply_id` null), trạng thái ∈ {`new`, `pending_review`, `needs_human`, `send_failed`}; kênh `connected`; không ai khác đang giữ khóa mềm còn hạn; nội dung 1–8000 ký tự sau trim → tạo outbox `queued`, đặt bình luận `sending`, ghi `action_logs` (không kèm nội dung). Lỗi trả mã SQLSTATE riêng cho từng lý do. **`cf.cancel_comment_reply(reply_id)`**: người yêu cầu hủy yêu cầu còn `queued` (bù khi đẩy job thất bại), trả bình luận về trạng thái trước.
3. **Giải quyết `COMMENTS-STATUS-GUARD`:** trigger `guard_comment_user_update` chặn đường người dùng đặt trạng thái hệ thống (`sending`, `replied`, `auto_replied`, `send_failed`, `scheduled_auto`, `processing`, `spam_suspected`, `hidden`) và sửa `external_reply_id`/`replied_at`/`label_source`; người dùng chỉ chuyển trạng thái trong {`skipped`, `pending_review`, `needs_human`} và (xóa) `replied_by` của chính mình; trigger miễn cho chủ bảng (hàm DEFINER) như `channels` — fail-closed với role khác.
4. **Job `send`** (worker, `withJob`): theo `docs/09` §6.1: R1 chưa trả lời & trạng thái `sending`; R2 chưa ẩn/gộp; R3 kênh `connected` và không bị tạm khóa gửi; trượt → hủy/lỗi có mã `recheck:R#`. Rồi `evaluateAction('reply')` theo khai báo connector (độ dài…); đánh dấu `sending`+`attempts`; gọi `connector.reply` (token qua `TokenProvider`); kết quả: **thành công** → outbox `sent`, bình luận `replied` + `external_reply_id` + `replied_by`/`replied_at`; **lỗi vĩnh viễn** → outbox `failed` + `error_code`, bình luận `send_failed`; `TOKEN_EXPIRED` → kênh `expired`, `PERMISSION` → kênh `revoked`, `BLOCKED` → `failed` (tạm khóa gửi 24 giờ là việc của Admin — gap `SEND-SUSPEND-ADMIN`); `RATE_LIMIT`/lỗi không rõ → ném để pg-boss thử lại (backoff mũ, tối đa 3 lần).
5. **Thử lại an toàn (FR-042 timeout):** lần chạy lại thấy outbox đã `sending` (lần trước có thể đã gửi thành công nhưng mất kết quả) → trước khi gửi lại gọi `connector.fetchComments` tìm câu trả lời của chính Page cho bình luận đó cùng nội dung; thấy → ghi `sent`, KHÔNG gửi lại.
6. **Hàng đợi `send`:** thêm vào `QUEUES` (retry 3, backoff mũ); worker đăng ký (đồng thời tối đa 3); web đẩy job sau khi hàm DB thành công (giao diện ở nhánh sau); đẩy lỗi → gọi hủy để không kẹt `sending` (bù); job quét lại outbox `queued` quá 2 phút là gap `SEND-SWEEP`.
7. **Sổ connector của worker:** `main.ts` dựng `ConnectorRegistry` rỗng cho tới khi có connector Facebook thật (nhánh `feat/fb-connector`); thiếu connector → outbox `failed` `connector_unavailable` (không thử lại vô ích). Test dùng connector giả (`@flow/connectors/testing`).
8. Chưa làm (ghi gap): hạn mức tốc độ gửi theo Page (R9, cần Redis token bucket → `SEND-RATE-LIMIT`), R4–R8 (tự gửi/giá/KB/lượt/cửa sổ tin nhắn — thuộc GĐ2+), "Gửi" lại hàng loạt, gợi ý AI/`drafts`.

## Tiêu chí nghiệm thu

1. Hàm `cf.request_comment_reply` (migration 0023, DEFINER, `search_path` cố định, chỉ `cf_app` EXECUTE): chỉ chạy trong ngữ cảnh người dùng đang hoạt động (Owner/Staff); `withWorkspace` trần/`withJob`/người ngoài/người bị khóa-gỡ → 42501; các điều kiện (trạng thái, đã trả lời/ẩn/gộp, kênh không `connected`, người khác giữ khóa, text rỗng/quá dài) → lỗi mã riêng, KHÔNG đổi gì; thành công → đúng một outbox `queued` + bình luận `sending` + `action_logs` không kèm nội dung; gọi lại khi đã có yêu cầu đang hoạt động → bị chặn (unique) — test tích hợp (ma trận × điều kiện).
2. `cf.cancel_comment_reply`: chỉ người yêu cầu hủy được yêu cầu còn `queued`; trả bình luận về trạng thái trước; người khác/yêu cầu đã `sending`+ → từ chối — test tích hợp.
3. `comment_replies`: `cf_app` không INSERT trực tiếp (kiểm cả check-rls), người dùng không UPDATE; hệ thống chỉ cập nhật cột kết quả; thành viên workspace khác không thấy; unique "một yêu cầu hoạt động / bình luận" — test tích hợp + check-rls.
4. Trigger bình luận: đường người dùng KHÔNG đặt được `sending`/`replied`/`send_failed`/… và không sửa `external_reply_id`/`replied_at`/`label_source`; vẫn đặt được `skipped`/`pending_review`/`needs_human`; hàm DEFINER và đường hệ thống không bị chặn — test tích hợp (cập nhật test ch-rls cũ) + check-rls (trigger tồn tại, bật).
5. Job `send` (`processSendJob`) với connector giả: gửi thành công (đúng `reply(channelRef, externalCommentId, text)`, một lần), ghi `sent`/`replied` + `external_reply_id` + `replied_by`; R1 (đã có `external_reply_id`/trạng thái khác `sending`) → hủy `recheck:R1` không gọi connector; R2 (đã ẩn/gộp); R3 (kênh không `connected`, hoặc `send_suspended_until` tương lai) → `failed` `recheck:R3`; text quá dài theo khai báo → `failed` `TEXT_TOO_LONG` không gọi connector — test tích hợp worker.
6. Lỗi connector: `TOKEN_EXPIRED` → outbox `failed`, bình luận `send_failed`, kênh `expired`; `PERMISSION` → kênh `revoked`; `BLOCKED` → `failed` không đổi kênh; `RATE_LIMIT`/`UNKNOWN` → ném (pg-boss thử lại), lần thứ 3 → `failed`; không connector → `failed` `connector_unavailable`; **lỗi không bao giờ làm lộ token/nội dung trong log, `error_code`** — test tích hợp + spy log.
7. Thử lại an toàn: job chạy lại khi outbox đang `sending` và connector (giả) báo đã có câu trả lời của Page cùng nội dung → ghi `sent` với id đó, `reply` KHÔNG được gọi lần nữa; không có → gửi lại bình thường; hai job `send` cùng outbox chạy song song → `reply` gọi đúng một lần (khóa dòng) — test tích hợp.
8. Hàng đợi `send` trong `QUEUES` + `queue:install`; worker đăng ký handler (đồng thời 3); schema job `{workspaceId, replyId}` ở `@flow/shared` — test đơn vị.
9. Lớp gọi `packages/db/src/replies.ts` (`requestCommentReply`, `cancelCommentReply` ánh xạ mã lỗi SQLSTATE → mã nghiệp vụ `ReplyRejection`) có test; không có `any`.
10. **Kiểm chứng độc lập một lần cuối nhánh** (verifier-security + verifier-db, Opus): token/gửi ra ngoài, chống gửi trùng, hàm DEFINER, trigger, RLS.
11. Công cụ xanh (đọc mã thoát từng lệnh): lint, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test, test:trace (FR-042 có test), test:coverage, `test:db`, `db:check-rls`, `next build`.

## File sẽ đọc (đã đọc) / sửa

Đọc: `docs/09` §6.1/§9, `docs/12` §1/§9, ADR 005/007, `0019_ch_schema.sql` (trigger bình luận), `packages/connectors/src/{types,capabilities,errors,registry,testing/fake-connector}.ts`, `apps/worker/src/{main,jobs/ingest,jobs/run-job,channels/token-provider,queue/definitions}.ts`, `packages/db/src/{channel-tokens,check-rls}.ts`.
Tạo/sửa: `packages/db/migrations/0023_comment_replies.sql` (+ `meta/`), `schema/cf/comment-replies.ts` (+ index), `packages/db/src/replies.ts` (+ `runtime.ts`), `check-rls.ts` (+ test); `packages/db/tests/comment-replies.int.test.ts`, sửa `tests/ch-rls.int.test.ts`; `packages/shared/src/queues.ts` (+ test: `SEND_QUEUE`, `sendJobSchema`); `apps/worker/src/jobs/send.ts` (+ `tests/send.int.test.ts`), `queue/definitions.ts`, `main.ts`; `docs/decisions/008-tra-loi-binh-luan-outbox.md`; `docs/codemap.md`; `docs/gap-matrix.md`; `docs/plans/MASTER.md`.

## Migration

`0023_comment_replies.sql`: bảng `cf.comment_replies` (+ khóa ngoại ghép `(workspace_id, comment_id)`, `(workspace_id, channel_id)`, CHECK trạng thái/độ dài, unique một yêu cầu hoạt động, chỉ mục), RLS (SELECT thành viên/hệ thống; UPDATE chỉ hệ thống; không INSERT/DELETE cho `cf_app`), quyền cột; hàm `cf.request_comment_reply`, `cf.cancel_comment_reply`; thay `cf.guard_comment_user_update` (miễn chủ bảng + chặn trạng thái/cột hệ thống ở đường người dùng). Đường lùi (comment cuối file): khôi phục trigger bản 0019/0020, `DROP FUNCTION` hai hàm, `DROP TABLE cf.comment_replies`. Tương thích ngược: bảng mới; trigger chỉ chặt hơn.

## Test viết trước

Tiêu chí 1–7. Lệnh hẹp:
```
pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/comment-replies.int.test.ts tests/ch-rls.int.test.ts tests/check-rls.int.test.ts
pnpm --filter @flow/worker exec vitest run --config vitest.int.config.ts tests/send.int.test.ts
pnpm db:migrate && pnpm db:check-rls
```

## Cần kiểm chứng độc lập không?

**Có — đúng một lần ở cuối nhánh** (`verifier-security` + `verifier-db`, Opus): hàm DEFINER, trigger thay thế, RLS bảng mới, job gửi (token, chống trùng, `sendRecheck`, lỗi không lộ dữ liệu). Đầu vào: diff + mục spec, không kèm lập luận.

## Rủi ro / câu hỏi cho chủ dự án

- Bảng `comment_replies` chưa có trong `docs/10`: ghi **đề xuất** ở ADR 008 (chờ bạn cho phép sửa docs/10 §3.2).
- Chưa có connector Facebook thật: trả lời tay chỉ chạy end-to-end khi xong `feat/fb-connector` + `FB-OAUTH` (cần Page thử); tới lúc đó job báo `connector_unavailable`.
- Không có bước bấm tay riêng (chưa có giao diện); KT ở nhánh `feat/reply-ui`.

## Đề xuất thay đổi

`docs/10` §3.2: thêm bảng `comment_replies` (ADR 008 §4) — chờ chủ dự án.

## Complexity tracking

- Hai hàm `SECURITY DEFINER` mới (đi ngược "truy vấn qua `withWorkspace()`", nguyên tắc #2): cần để người dùng KHÔNG tự đặt trạng thái hệ thống mà vẫn tạo được yêu cầu gửi có kiểm tra; phương án đơn giản hơn đã loại: cho `cf_app` UPDATE `status`/INSERT outbox trực tiếp (người dùng giả trạng thái `replied`/gửi tùy ý).
- Bảng ngoài `docs/10` (xem trên).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier)
- [x] Không thư viện mới; vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ
- [x] Bảng mới `comment_replies`: policy ghi chỉ-hệ thống (UPDATE), không INSERT/DELETE cho `cf_app`; đọc theo thành viên

## Trạng thái duyệt

**Đã duyệt** (tự duyệt theo `docs/PROMPT_BUILD_TOAN_BO.md` §2: thiết kế theo spec/ADR; mục ngoài spec — bảng outbox — ghi ADR + đề xuất docs, không sửa docs/01–16; chủ dự án giao 06/11/2026 làm ngay trả lời tay qua connector fixture + job send).
