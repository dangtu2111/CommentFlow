# 008 — Trả lời bình luận: hàng đợi gửi (outbox), hàm DEFINER, job `send` (06/11/2026)

Trạng thái: **Đã áp dụng** ở `feat/reply-backend` (migration 0023). Căn cứ: `docs/09` §6.1 (`sendRecheck`), §9; `docs/11` §5; `docs/12` §1, §9; FR-042; ADR 005 §3, ADR 007.

## 1. Vấn đề

Nhân viên bấm Gửi trả lời. Hệ thống phải (a) không để người dùng tự đặt trạng thái "đã trả lời" hay tự chèn việc gửi tùy ý, (b) không gửi trùng khi job chạy lại/chạy song song, (c) xử lý lỗi nền tảng đúng (token hết hạn, mất quyền, giới hạn tốc độ), (d) không lộ token/nội dung.

## 2. Quyết định

- **Bảng outbox `cf.comment_replies`** (nội dung gửi nằm ở đây; `drafts` của AI sẽ có sau): trạng thái `queued → sending → sent | failed | cancelled`. Unique **một yêu cầu đang hoạt động** (`queued`/`sending`) cho mỗi bình luận. RLS: thành viên/đường hệ thống đọc; **chỉ đường hệ thống UPDATE** cột kết quả; `cf_app` không INSERT/DELETE.
- **Hàm DEFINER `cf.request_comment_reply(comment_id, text)`** (`withActor`): thành viên đang hoạt động; bình luận ở workspace hiện tại, chưa trả lời/ẩn/gộp, trạng thái ∈ {`new`, `pending_review`, `needs_human`, `send_failed`}; kênh `connected`; không ai khác giữ khóa mềm còn hạn; nội dung 1–8000 ký tự (cắt khoảng trắng đầu/cuối). Tạo outbox `queued` + đặt bình luận `sending` + `action_logs` (không kèm nội dung). Lỗi dùng SQLSTATE riêng: `CF404` không thấy · `CF409` không trả lời được ở trạng thái này · `CF423` người khác giữ khóa · `CF424` kênh không kết nối · `CF422` nội dung không hợp lệ · `42501` không có quyền. **`cf.cancel_comment_reply`**: người yêu cầu hủy yêu cầu còn `queued` (bù khi đẩy job lỗi).
- **Trigger bình luận** (giải quyết gap `COMMENTS-STATUS-GUARD`): đường người dùng **không** đặt được trạng thái hệ thống (`sending`, `replied`, `auto_replied`, `send_failed`, `scheduled_auto`, `processing`, `spam_suspected`, `hidden`), không đổi trạng thái khi bình luận đang ở trạng thái hệ thống, không sửa `external_reply_id`/`replied_at`/`private_replied_at`; `label_source` chỉ được đặt `human`. Người dùng chỉ chuyển giữa {`skipped`, `pending_review`, `needs_human`}. Trigger miễn **chủ bảng** (hàm DEFINER đã tự kiểm quyền) và đường hệ thống — fail-closed với mọi role khác.
- **Job `send`** (worker, `withJob`): `sendRecheck` R1 (chưa trả lời, trạng thái `sending`), R2 (chưa ẩn/gộp), R3 (kênh `connected`, không tạm khóa gửi) trong MỘT giao dịch khóa dòng yêu cầu; rồi `evaluateAction('reply')` theo khai báo connector; đánh dấu `sending` (+`attempts`, thuê 90 giây); gọi `connector.reply` NGOÀI giao dịch; ghi kết quả ở giao dịch riêng.
- **Chống gửi trùng:** (1) unique yêu cầu hoạt động; (2) khóa dòng + **thuê 90 giây** — job khác thấy `sending` còn thuê thì ném `SendInFlightError` (pg-boss thử lại), không gửi song song; (3) thuê hết hạn/lỗi không rõ (có thể đã gửi nhưng mất kết quả) → **kiểm trước khi gửi lại**: `connector.fetchComments` tìm câu trả lời của chính Page cho bình luận đó cùng nội dung; thấy → ghi `sent`, KHÔNG gửi lại.
- **Lỗi nền tảng:** `TOKEN_EXPIRED` → kênh `expired`; `PERMISSION` → kênh `revoked`; `BLOCKED` → thất bại (tạm khóa gửi 24 giờ là việc Admin — gap `SEND-SUSPEND-ADMIN`); `RATE_LIMIT` → trả `queued`, thử lại (backoff mũ); `UNKNOWN` → giữ `sending`, hết thuê, thử lại; hết lượt (retryLimit 3 → tối đa 4 lần chạy) → `failed`. `error_code` chỉ chứa mã (`PlatformErrorCode`, `recheck:R#`, `connector_unavailable`, `cancelled_by_user`); log chỉ có mã, không `message`/token/nội dung.
- Sổ connector của worker **rỗng** cho tới khi có connector Facebook thật (`feat/fb-connector`): thiếu → `failed connector_unavailable`.

## 3. Giới hạn đã biết / gap

`SEND-SWEEP` (job quét yêu cầu `queued` bị bỏ quên khi đẩy job lỗi và bù hủy cũng lỗi), `SEND-RATE-LIMIT` (R9: token bucket theo Page, cần Redis), `SEND-SUSPEND-ADMIN` (Admin ghi `send_suspended_*`), R4–R8 (tự gửi/giá/KB/lượt/cửa sổ tin nhắn — GĐ2+), hạn mức đồng thời 3/kênh (hiện 3 toàn worker). Web và worker dùng chung role `cf_app` (gap `WORKER-DB-ROLE`, bắt buộc trước staging): web bị chiếm hoàn toàn thì tự đặt `app.ctx = 'system'` ghi được kết quả gửi giả — cùng mô hình ADR 005 §3.

## 4. Đề xuất sửa `docs/10` §3.2 (chưa sửa — chờ chủ dự án cho phép)

Thêm bảng `comment_replies` (workspace_id, channel_id, comment_id, text, requested_by, status `queued`/`sending`/`sent`/`failed`/`cancelled`, attempts, external_reply_id, error_code, previous_status, sent_at, created_at, updated_at; unique một yêu cầu hoạt động / bình luận; khóa ngoại ghép `(workspace_id, comment_id)`, `(workspace_id, channel_id)`) và dòng quyền tương ứng ở §4 (đọc: thành viên; ghi: chỉ qua `cf.request_comment_reply`/`cf.cancel_comment_reply`; cập nhật kết quả: chỉ hệ thống). Khi dựng `drafts` (GĐ2), cân nhắc gộp/liên kết `draft_id`.
