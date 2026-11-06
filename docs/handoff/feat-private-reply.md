# Handoff feat-private-reply (claude, làn d)

**Đã làm:** `packages/ai/src/private-reply/` — `privateReplyCheck` (P1–P8), `privateReplyDeadline`, nhãn lý do tiếng Việt; test ví dụ + biên + property (fast-check). Không migration, không giao diện. Q-PRP1 (AI không tự nhắn riêng).
**Đã đọc/rút ra:** `sendRecheck` (mẫu, hằng cửa sổ/lệch đồng hồ), `capabilities.ts`/`declarations.ts` (Facebook privateReply: 7 ngày, oncePerTarget). `@flow/ai` không phụ thuộc `@flow/connectors` nên hằng 7 ngày lặp lại (có ghi trong codemap).
**Còn lại (`PRIVATE-REPLY-WIRE`):** cột/bảng "đã nhắn riêng" + ghi `automation_events` (migration, làn b); job gửi gọi `privateReplyCheck` rồi `connector.privateReply`; nút giao diện sau bộ thành phần chung.
