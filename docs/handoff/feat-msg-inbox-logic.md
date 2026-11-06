# Handoff `feat-msg-inbox-logic` (agent vừa làm: claude)

## Đã làm
`packages/ai/src/inbox/`: `inbox-policy.ts` (cửa sổ, `decideInboxSend`, `messageRecheckFor`, `deriveInboxState`, `isExpiringSoon`, `shouldHandoffToHuman`) và `inbox-claim.ts` (khóa người xử lý + store bộ nhớ). TDD + property-based (khớp R8 của `sendRecheck`). Quyết định Q-MIL1. Docs: codemap, gap `MSG-INBOX-LOGIC`, KT-MIL1.

## Đã đọc + điều rút ra
- `conversationWindow` (shared) biên bao gồm mốc; R8 biên loại trừ → inbox dùng biên R8.
- `conversations` có `ai_turns`, `ai_enabled`, `status`, `last_customer_msg_at`; chưa có cột đếm hỏi lại hay khóa người xử lý.

## Còn lại (`MSG-INBOX-WIRE`, cần migration làn b)
Ghi `ai_turns`/đếm hỏi lại, lưu khóa (Redis `SET NX`/cột DB) cài `ConversationClaimStore`, gọi `decideInboxSend` + `sendRecheck(message: messageRecheckFor(...))` từ job gửi; giao diện hộp thư.
