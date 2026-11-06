# Handoff `feat-msg-store` (claude)

**Đã làm:** migration 0058 (`cf.conversations`, `cf.messages`, RLS, trigger chặn nhân viên sửa mốc cửa sổ/giả tin khách-AI), truy vấn `queries/conversations.ts` (ghi tin khách chống trùng mid, danh sách/lọc cửa sổ, giao việc, bật/tắt AI), hàm thuần `conversationWindow` (`@flow/shared`), test đơn vị + test DB, kỳ vọng `check-rls.ts`, Q-MSS1, docs/10, codemap, gap/MASTER. verifier-db và verifier-security: không có "Chặn merge"; đã sửa các mục "Nên sửa" (messages_insert siết, index khớp ORDER BY, listMessages lấy tin mới nhất, trigger/no-delete trong check-rls).

**Đã đọc + rút ra:** mẫu 0045 (policy member/system), `is_system_context` cần `cf_worker` (withJob); `drizzle-kit generate` rồi sửa tay SQL (snapshot phải khớp — copy snapshot sau sinh); `pnpm db:check-rls` CLI trên DB dev của máy này lỗi do DB dev thiếu migration cũ (không liên quan), `check-rls.int.test.ts` đạt.

**Còn lại:** `MESSENGER-INGEST` (gọi `recordInboundMessage` từ worker khi webhook messages), `MSG-INBOX` UI + AI theo hội thoại/tối đa lượt AI/chuyển người, `MSG-GREETINGS-WIRE`; retention PII cho `messages`; khi vô hiệu thành viên nên bỏ `assigned_to` của họ; tìm tên không dấu (unaccent).
