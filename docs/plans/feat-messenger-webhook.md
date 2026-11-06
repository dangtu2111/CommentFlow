# Kế hoạch `feat-messenger-webhook` — Webhook `messages` + gửi tin Messenger

## Việc

Mã gap matrix: `MESSENGER-WEBHOOK` · Spec: FR-014, `docs/12` §1, BR-14.

**Tóm tắt:** Thêm vào `packages/connectors` (1) chuẩn hóa webhook Messenger (`messages` + `message_echoes`, thời điểm theo mili-giây), (2) hàm thuần `messengerSendMode` quyết định cửa sổ 24 giờ (RESPONSE) / 24 giờ–7 ngày (chỉ người, `MESSAGE_TAG`+`HUMAN_AGENT`) / quá 7 ngày (khóa), (3) bộ gửi `createMessengerSender` gọi Send API. Chữ ký `X-Hub-Signature-256` dùng lại `verifyMetaSignature` (route web đã kiểm trên thân thô). Cờ worker `MESSENGER_CONNECTOR_ENABLED` mặc định TẮT. Chưa gọi Meta thật (**Xong-mock**). Rủi ro: hình dạng thật có thể lệch fixture viết tay; ghi KT cần Page thử + App Review `pages_messaging`.

## Điểm chưa rõ

Không có. Quyết định tự chọn: `docs/plans/quyet-dinh/q-msw1.md`.

## Tiêu chí nghiệm thu

1. `parseMessengerWebhook`: tin khách → `direction: in`; echo → `out` + `isFromPage`; giờ = `messaging[].timestamp` (ms); ảnh/video → attachments; sai object/thiếu mid/giờ/sender, người nhận ≠ Page, delivery/read, rỗng → bỏ; một tin hỏng không làm mất tin tốt — test `FR-014 parseMessengerWebhook`.
2. `messengerSendMode`: 23h59 tự động; đúng 24h còn RESPONSE; 24h01 chỉ người (HUMAN_AGENT), AI bị `HUMAN_REQUIRED`; đúng 7 ngày người còn gửi; 7 ngày + 1 phút `WINDOW_EXPIRED`; mốc tương lai coi như 0 — test.
3. `sendMessage`: `POST /{page}/messages`, token + `appsecret_proof` ở thân (không ở URL); ngoài cửa sổ/AI ngoài 24h bị từ chối TRƯỚC khi gọi mạng; văn bản rỗng/>2000 ký tự, id sai dạng bị chặn; lỗi Graph 190/10/4/368 → mã chuẩn, thông báo không chứa token/nội dung; mạng/2xx thiếu `message_id` → UNKNOWN — test.
4. Worker: `MESSENGER_CONNECTOR_ENABLED` chỉ đúng `true` mới bật, độc lập FB/IG; tắt → `null`, bật thiếu khóa → ném — test config + builder.
5. Coverage `packages/connectors` không giảm — `pnpm --filter @flow/connectors test:coverage`.

## File sẽ đọc

`facebook/{connector,webhook}.ts`, `instagram/webhook.ts` (mẫu), `attachments.ts`, `capabilities.ts`, `declarations.ts`, `types.ts`, `apps/worker/src/{config,channels/connector-registry}.ts`.

## File sẽ sửa / tạo

- `packages/connectors/src/messenger/{webhook,window,sender,fixtures}.ts` + 3 file test (mới); `packages/connectors/src/index.ts` (export).
- `apps/worker/src/config.ts` (+test), `channels/messenger-sender.ts` (+test) (mới).
- `env.example`; tài liệu: quyết định, cần-bạn-cung-cấp, KT, codemap, gap-matrix, MASTER, handoff.

## Migration

Không có (chỉ làn b). Phần cần bảng: ghi `conversations`/`messages` (docs/10 §messages), route web ghi sự kiện `messaging`, job gửi — gap `MESSENGER-INGEST` (làn b) và `MSG-INBOX`.

## Test viết trước

Fixture + 3 file test viết và chạy đỏ (thiếu module) trước khi viết mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/messenger`; `pnpm --filter @flow/worker exec vitest run src/config.test.ts src/channels/messenger-sender.test.ts`.

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (chữ ký webhook dùng lại, token/`appsecret_proof`, cổng cửa sổ).

## Rủi ro / câu hỏi cho chủ dự án

Cần Page thử + quyền `pages_messaging` (App Review) và đăng ký webhook field `messages`, `message_echoes` để đường thật chạy.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có. (Sender tách khỏi `createFacebookConnector` vì sổ connector khóa theo nền tảng; không thêm thư viện.)

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR hoặc ghi ở Q-MSW1).
