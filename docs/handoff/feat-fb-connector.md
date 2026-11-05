# Bàn giao `feat/fb-connector` (claude, làn b)

## Đã làm
- Connector Facebook Graph `v27.0` ở `packages/connectors/src/facebook/connector.ts` + fixture viết tay (`connector.fixtures.ts`) + contract test (`connector.test.ts`). ADR `docs/decisions/010-facebook-connector.md` (nguồn tài liệu + ngày đọc + bảng mã lỗi).
- `PlatformConnector.fetchReplies?` (tùy chọn) thêm vào `types.ts`; `cleanText` export từ `webhook.ts`.
- Chưa gọi Meta thật; chưa đăng ký vào worker.

## File đã đọc + điều rút ra
- `types.ts`/`contract.ts`: có phương thức ⇔ khai báo `supported` → connector khai `privateReply`/`sendMessage` `supported:false`.
- `apps/worker/src/jobs/send.ts` `findExistingReply`: gọi `fetchComments(channel, since)` rồi lọc cha → phải đổi sang `fetchReplies` khi nối connector.
- Tài liệu Meta: không có `X-Page-Usage` (dùng `X-Business-Use-Case-Usage`); trang Comment bản tiếng Việt thiếu trường `from/message/created_time`.

## Việc còn lại
- `FB-CONNECTOR-REGISTER`, `SEND-FIND-REPLY-BY-PARENT`, `FB-FETCH-PAGE-WIDE` (gap-matrix), KT-012 cần Page thật.
- Mã chuẩn thêm cho lỗi 100 (đề xuất, chưa làm).
