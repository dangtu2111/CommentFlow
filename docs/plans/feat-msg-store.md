# Kế hoạch `feat-msg-store` — Nền dữ liệu hội thoại/tin nhắn (MSG-INBOX, phần lưu trữ)

## Việc

Mã gap matrix: `MSG-STORE` (tách từ `MSG-INBOX`) · Spec: FR-047, `docs/10_Database_Design.md` (`conversations`, `messages`), `docs/12` §1 (cửa sổ 24 giờ/7 ngày).

**Tóm tắt:** Thêm hai bảng lưu hội thoại và tin nhắn (có người xử lý, trạng thái, bật/tắt AI, số lượt AI, mã tin `mid` chống trùng), bảo vệ bằng RLS (khóa dữ liệu theo workspace ở tầng DB), kèm truy vấn danh sách/lọc theo cửa sổ 24 giờ/7 ngày và hàm thuần tính hạn cửa sổ. Chưa có nơi ghi trong luồng thật (webhook Messenger sẽ ghi sau ở `MESSENGER-INGEST`); không gọi dịch vụ ngoài. Rủi ro: nhân viên không được tự kéo dài cửa sổ → có trigger chặn.

## Điểm chưa rõ

Không có (quyết định Q-MSS1 tự chọn phương án an toàn).

## Tiêu chí nghiệm thu

1. Hàm `conversationWindow` đúng biên 24 giờ / 7 ngày (đúng mốc còn trong cửa sổ, +1ms qua cửa sổ), null/tương lai an toàn — kiểm bằng `packages/shared/src/conversation-window.test.ts`.
2. Webhook gửi lại cùng `mid` không tạo tin trùng và không làm lùi mốc cửa sổ — `pnpm test:db` (`conversations.int.test.ts`).
3. Workspace B không đọc/ghi/giao việc được hội thoại của A; người ngoài không đọc; kênh chéo workspace bị FK từ chối — như trên.
4. Chỉ hệ thống (worker) tạo hội thoại; withWorkspace trần chỉ đọc; nhân viên/Owner không sửa `last_customer_msg_at`, `ai_turns`, tên khách — như trên.
5. Giao việc chỉ cho thành viên đang hoạt động của workspace; bật/tắt AI, đổi trạng thái hoạt động — như trên.
6. Danh sách lọc theo cửa sổ/người xử lý/trạng thái/AI/tên (ký tự `%` `_` là chữ thường), phân trang con trỏ không trùng/sót — như trên.
7. `check-rls` đạt với policy/GRANT mới — `check-rls.int.test.ts`.

## File sẽ đọc

`docs/10` mục bảng, `schema/cf/post-notes.ts` + `migrations/0045` (mẫu), `check-rls.ts` (mảng kỳ vọng), `connectors/src/messenger/window.ts` (quy tắc biên), `tests/post-notes.int.test.ts` (mẫu test).

## File sẽ sửa / tạo

Tạo: `packages/shared/src/conversation-window{,.test}.ts`, `packages/db/src/schema/cf/conversations.ts`, `migrations/0058_msg_store.sql` (+ meta), `queries/conversations.ts`, `tests/conversations.int.test.ts`, tài liệu phụ (quyết định, codemap, KT). Sửa: `shared/src/index.ts`, `schema/cf/index.ts`, `check-rls.ts`, `docs/10`, gap matrix, MASTER.

## Migration

`0058_msg_store`: bảng `cf.conversations`, `cf.messages`, RLS, GRANT theo cột, trigger `cf.guard_conversation_user_update` (SECURITY DEFINER, search_path cố định). Đường lùi: DROP TABLE cf.messages, cf.conversations; DROP FUNCTION cf.guard_conversation_user_update(); bỏ kỳ vọng ở check-rls.ts.

## Test viết trước

Cửa sổ 24 giờ/7 ngày (viết đỏ trước); RLS/trigger/chống trùng (test DB).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared test` · `pnpm --filter @flow/db test:db tests/conversations.int.test.ts`

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration/RLS) và `verifier-security` (RLS, quyền kéo dài cửa sổ 24 giờ).

## Rủi ro / câu hỏi cho chủ dự án

Không lưu `window_state` (khác docs/10 cũ) — đã sửa docs/10. Lưu văn bản tin thô: chính sách giữ/xóa PII cho `messages` làm ở việc ingest/retention sau.

## Đề xuất thay đổi

Nối retention (`retention-policy`) cho `messages` khi ingest được bật.

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

Policy GHI: `conversations` INSERT chỉ hệ thống (`withJob`); UPDATE thành viên (`withActor`) hoặc hệ thống; `messages` INSERT thành viên hoặc hệ thống; không DELETE; `withWorkspace` trần chỉ đọc.

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-MSS1).
