# Bàn giao `feat-reply-lang-ui` (agent: claude, làn a)

## Đã làm
- Thẻ "Ngôn ngữ trả lời" theo kênh ở Cài đặt (Owner), lưu `channels.reply_language`; `reply-style.ts` (giá trị + kiểm xưng hô); test; i18n vi/en; KT-023.

## Đã đọc và rút ra
- `channels` UPDATE `reply_language`: chỉ Owner/hệ thống (RLS + trigger, `ch-rls.int.test.ts`). `listChannels` giờ trả thêm `replyLanguage`.
- `brand_voice` chưa có migration (docs/10 §3.4).

## Còn lại
- `REPLY-ADDRESS-UI`: sau khi làn b thêm `brand_voice`, nối `isValidAddress` vào form xưng hô + lưu; `guard` kiểm lệch xưng hô (phần AI).
- Chưa có test tích hợp riêng cho `setChannelReplyLanguage` (làn a không có DB; quyền đã phủ ở `ch-rls`).
