# Bàn giao `feat-messenger-webhook` (claude, làn c)

## Đã làm

`MESSENGER-WEBHOOK` (FR-014) **Xong-mock**, không migration, chưa gọi Meta thật. Plan: `docs/plans/feat-messenger-webhook.md`; quyết định Q-MSW1.
- `packages/connectors/src/messenger/`: `parseMessengerWebhook` (giờ ms, echo = `out`), `messengerSendMode` (24 giờ / 7 ngày), `createMessengerSender` (Send API, token ở thân, kiểm cửa sổ + khớp kênh trước khi gọi mạng).
- Worker: cờ `MESSENGER_CONNECTOR_ENABLED` (tắt) + `channels/messenger-sender.ts` (`buildMessengerSender`, chưa ai gọi).

## Đã đọc và rút ra

- Route web `meta-webhook.ts` chỉ gọi `parseMetaWebhook` (feed) → tin `messaging` hiện bị bỏ qua, chưa ghi DB.
- `PlatformConnector.sendMessage` khai `supported:false` ở connector Facebook; sender Messenger tách riêng (Q-MSW1).

## Còn lại (ghi từ `verifier-security`, không có mục Chặn merge)

- `MESSENGER-INGEST` (làn b, migration): bảng hội thoại/tin nhắn; route gọi `parseMessengerWebhook` SAU `verifyMetaSignature` trên cùng thân thô, hash chống trùng theo `mid`; **chỉ cập nhật `lastUserMessageAt` khi `direction === 'in'`** (echo không kéo dài cửa sổ) + test hồi quy.
- `MSG-INBOX`: job gửi phải đi qua cổng tự gửi + `sendRecheck` R8; cờ `humanAgent` phải do code suy từ người bấm gửi (không nhận từ client); cân nhắc đổi thành kiểu `sentBy: human | auto`; đọc cờ lỗi → coi như tự gửi tắt.
