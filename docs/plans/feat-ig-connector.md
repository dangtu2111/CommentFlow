# Kế hoạch `feat-ig-connector` — Connector Instagram (đọc/trả lời/ẩn bình luận)

## Việc

Mã gap matrix: `IG-CONNECTOR` · Spec: FR-013, `docs/12` §2.

**Tóm tắt:** Thêm connector Instagram vào `packages/connectors` theo mẫu connector Facebook: đọc bình luận, trả lời, ẩn/bỏ ẩn, đọc trả lời theo cha (cho bước "kiểm trước khi gửi lại"), xác minh chữ ký + chuẩn hóa webhook `comments`. Dùng Instagram Graph API chính thức (đăng nhập qua Facebook, cùng Meta App và token Page). Đăng ký ở worker sau cờ `IG_CONNECTOR_ENABLED` (mặc định TẮT). Chưa có tài khoản IG Business thử nên toàn bộ kiểm bằng fixture viết tay theo tài liệu Meta — **Xong-mock**, chưa gọi Meta thật. Rủi ro: hình dạng phản hồi thật có thể lệch fixture (đã ghi KT cần tài khoản thật).

## Điểm chưa rõ

Không có. Quyết định tự chọn: `docs/plans/quyet-dinh/q-ig1.md` (đường Facebook Login, host `graph.facebook.com`).

## Tiêu chí nghiệm thu

1. Connector thỏa `checkConnectorContract`, khai báo = `DECLARED_CAPABILITIES.instagram` — test `FR-013 connector Instagram`.
2. `reply` = `POST /{comment}/replies`, `setHidden` = `POST /{comment}` với `hide=true|false`; token + `appsecret_proof` nằm trong thân, không nằm trong URL; id sai dạng bị chặn trước khi gọi mạng — test.
3. Đọc: `fetchReplies` đủ trang bằng con trỏ `after` (không theo URL `next`), vượt hạn mức → lỗi; `fetchPostComments` lọc `since`; `fetchComments` quét media mới nhất — test.
4. Lỗi Graph 190/10/200/4/17/80002/368 → mã chuẩn; thông báo lỗi không chứa token/URL/nội dung; mạng/2xx thiếu id → `UNKNOWN` — test.
5. Webhook: chữ ký `X-Hub-Signature-256` đúng/sai/thiếu; `comments` → `comment_created` (thời điểm từ `entry.time`, cha từ `parent_id`, `isFromPage` khi `from.id` = tài khoản); sai object/field/thiếu trường → bỏ — test.
6. Worker: `IG_CONNECTOR_ENABLED` chỉ đúng `true` mới bật, độc lập cờ Facebook; cả hai tắt → sổ rỗng; thiếu khóa → ném — test config + registry.
7. Coverage `packages/connectors` không giảm — `pnpm --filter @flow/connectors test:coverage`.

## File sẽ đọc

`facebook/{connector,webhook}.ts` (mẫu), `attachments.ts`, `types.ts`, `contract.ts`, `declarations.ts`, `apps/worker/src/{config,main}.ts`, `channels/connector-registry.ts`, `docs/12` §2.

## File sẽ sửa / tạo

- `packages/connectors/src/instagram/{connector,webhook,fixtures}.ts` + 2 file test (mới).
- `packages/connectors/src/facebook/connector.ts`: chỉ thêm `export` cho `classifyGraphCode`, `retryAfterOf` (dùng lại, không lặp).
- `packages/connectors/src/index.ts`: export connector/webhook Instagram.
- `apps/worker/src/{config,main}.ts`, `channels/connector-registry.ts` (+ test): cờ `IG_CONNECTOR_ENABLED`.
- `env.example`, `docs/12` §2, tài liệu: quyết định, cần-bạn-cung-cấp, KT, codemap, gap-matrix, MASTER, handoff.

## Migration

Không có (chỉ làn b). Phần cần bảng/route (route webhook web nhận `object: instagram`, OAuth lấy IG Business ID của kênh) ghi gap `IG-WEBHOOK-ROUTE`, `IG-CHANNEL-CONNECT`.

## Test viết trước

Fixture + test webhook/connector viết trước code; chạy đỏ → xanh.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/instagram`; `pnpm --filter @flow/worker exec vitest run src/config.test.ts src/channels/connector-registry.test.ts`.

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (chữ ký webhook, token, `appsecret_proof`).

## Rủi ro / câu hỏi cho chủ dự án

Cần tài khoản IG Business/Creator thử liên kết Page + quyền `instagram_manage_comments` (App Review) để bật đường thật.

## Đề xuất thay đổi

Không có.

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

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR hoặc ghi ở Q-IG1).
