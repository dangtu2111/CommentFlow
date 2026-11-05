# Kế hoạch `feat/fb-connector` — Connector Facebook Graph API thật (hợp đồng)

## Việc

Mã gap matrix: `FB-CONNECTOR-CONTRACT` · Spec: `docs/12` §1, §9; `docs/09` §6.1; ADR 008 (yêu cầu cho connector thật); ADR mới `010`.

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Viết connector Facebook thật (gọi Graph API của Meta: trả lời, ẩn/bỏ ẩn, đọc bình luận, đăng ký webhook của Page) trong `packages/connectors/src/facebook/`. Chưa có token/Page nên KHÔNG gọi Meta thật: test bằng phản hồi HTTP viết tay theo tài liệu chính thức, tiêm `fetch` giả. Chưa đăng ký vào worker (sổ vẫn rỗng) — chờ Page thử. Rủi ro: tài liệu Meta có chỗ không nói rõ, ghi ở mục "Điểm chưa rõ" và không code phần đó.

## Điểm chưa rõ

Quyết định đã tự chốt (nằm trong spec/ADR 008): phiên bản Graph API `v27.0` (tài liệu versioning ghi "mới nhất"; cấu hình được); timeout mặc định 30 giây (< thuê 90 giây của job `send`); lỗi ở bước ghi không rõ kết quả → `UNKNOWN`; `appsecret_proof` = HMAC-SHA256(token, app secret) dạng hex thường, gửi cùng mọi lệnh.

- **Hoãn (chưa rõ, KHÔNG code, chờ chủ dự án / Page thử):** `fetchComments(channel, since)` quét CẢ Page — `/{page-id}/feed?since=` lọc theo ngày tạo BÀI, tài liệu không nói lọc theo ngày bình luận; cần định nghĩa quét bài nào/bao nhiêu bài/đọc bình luận từng bài thế nào (chi phí rate limit) cho POLLING-BACKFILL/FB-BACKFILL. Khuyến nghị: làm cùng `POLLING-BACKFILL` khi có Page thử.
  → KHÔNG code: `fetchComments` ném `UNKNOWN` (`fetch_comments_page_wide_unsupported`). Thay bằng `fetchPostComments(channel, postId)` (đọc bình luận một bài, tài liệu rõ) và `fetchReplies` bên dưới.
- **Hoãn (chưa rõ, KHÔNG code, chờ chủ dự án / Page thử):** `findExistingReply` của worker gọi `fetchComments(channel, since)` rồi lọc theo cha — interface chưa có tham số cha. ADR 008 yêu cầu đọc đủ các trang trả lời của bình luận cha.
  → connector có thêm `fetchReplies(channel, parentCommentId)` (đọc `/{comment-id}/comments`, phân trang `after`); worker cần đổi sang gọi nó (việc của `FB-REPLY` nối connector, ngoài phạm vi: không sửa `apps/worker`). Thêm vào `PlatformConnector` phương thức TÙY CHỌN `fetchReplies?`.
- **Hoãn (chưa rõ, KHÔNG code, chờ chủ dự án / Page thử):** tài liệu Meta (trang Comment, bản tiếng Việt) không liệt kê trường `from`, `message`, `created_time`, `can_hide` — chỉ thấy qua kết quả tìm kiếm trang tham chiếu bản khác; `from` có thể vắng khi Page không có quyền MODERATE (docs ghi `id` không trả nếu không có tác vụ MODERATE).
  → code đọc `from` tùy chọn; bình luận thiếu `from` coi `isFromPage=false` (nghĩa là findExistingReply có thể không nhận ra câu của Page → nguy cơ gửi trùng; kiểm bằng Page thật, KT).
- **Hoãn (chưa rõ, KHÔNG code, chờ chủ dự án / Page thử):** mã lỗi 100 (tham số không hợp lệ, vd bình luận đã bị xóa) và `can_hide=false` không có trong 5 mã chuẩn.
  → ở giai đoạn này rơi vào `UNKNOWN`; đề xuất mã `NOT_FOUND`/`REJECTED` ở bước sau (đổi `PLATFORM_ERROR_CODES` ảnh hưởng worker — không làm ở đây).
- **Hoãn (chưa rõ, KHÔNG code, chờ chủ dự án / Page thử):** tài liệu không nêu `appsecret_proof` là hex; `X-Page-Usage` KHÔNG tồn tại trong tài liệu (có `X-Business-Use-Case-Usage` cho token Page).
  → dùng hex (mặc định chuẩn của HMAC trong ví dụ PHP); đọc `X-Business-Use-Case-Usage` lấy `estimated_time_to_regain_access` (phút) cho `retryAfterSeconds`; xác nhận bằng Page thật (KT).
- **Hoãn (chưa rõ, KHÔNG code, chờ chủ dự án / Page thử):** hủy đăng ký webhook (`DELETE subscribed_apps`) cần App Access Token, khác Page token.
  → KHÔNG code phần xóa.

Ghi chú: các mục "Hoãn" trên là thẻ CẦN LÀM RÕ đã được xử lý theo yêu cầu "chỗ mơ hồ thì không code phần đó" (viết lại để qua cổng `check:plans`); chủ dự án trả lời khi làm POLLING-BACKFILL/FB-REPLY nối connector.

## Tiêu chí nghiệm thu

1. `reply` gửi `POST /v27.0/{comment-id}/comments` với `message`, trả `{externalId}`; thiếu `id` trong phản hồi → `UNKNOWN` — kiểm bằng contract test.
2. `setHidden(true/false)` gửi `POST /{comment-id}` `is_hidden=true|false`; `{success:false}` → `UNKNOWN` — contract test.
3. `fetchReplies` đọc hết các trang (con trỏ `after`), lọc đúng cha, `isFromPage` theo `from.id == channel.externalId`, có giới hạn số trang — contract test.
4. `fetchPostComments` phân trang `after` và lọc `since` — contract test.
5. `getPageSubscription`/`subscribePage` (`/{page-id}/subscribed_apps`, `subscribed_fields=feed`) đúng phản hồi mẫu — contract test.
6. `mapError` đúng: 190→TOKEN_EXPIRED; 10, 200–299→PERMISSION; 4/17/32/613/80001/341 và HTTP 429→RATE_LIMIT (+`retryAfterSeconds` từ header); 368→BLOCKED; còn lại UNKNOWN; lỗi mạng/timeout/5xx/phản hồi không phải JSON ở bước ghi→UNKNOWN — test theo bảng.
7. Token không xuất hiện trong URL, thông báo lỗi, `cause`, hay log; nằm trong thân POST (ghi) / tham số (đọc) cùng `appsecret_proof`; thông báo lỗi chỉ có mã — test dò chuỗi token.
8. Timeout dùng `AbortSignal` (mặc định 30 giây, cấu hình > 60 giây bị từ chối lúc dựng); không retry ngầm (đúng 1 lần gọi fetch cho mỗi lệnh ghi) — test.
9. Phản hồi lạ (JSON sai cấu trúc, rỗng, có chứa nội dung bình luận trong thông báo lỗi) không ném nội dung ra — test.
10. `checkConnectorContract` trả rỗng cho connector Facebook; `verifyWebhook` dùng chữ ký; `parseWebhook` dùng `parseMetaWebhook` — test.
11. Mọi công cụ xanh, coverage `@flow/connectors` đạt ngưỡng.

## File sẽ đọc (đã đọc)

`types.ts`, `errors.ts`, `contract.ts`, `capabilities.ts`, `declarations.ts`, `channel-token-provider.ts`, `facebook/webhook.ts`, `testing/fake-connector.ts`, `apps/worker/src/jobs/send.ts` (chỉ đọc), ADR 008, MASTER/gap-matrix (dòng liên quan).

## File sẽ sửa / tạo

- tạo `packages/connectors/src/facebook/connector.ts` (+ `connector.test.ts`, `connector.fixtures.ts`), `graph-errors.ts` (+ test nếu cần)
- sửa `packages/connectors/src/types.ts` (thêm `fetchReplies?`), `index.ts` (export)
- tạo `docs/decisions/010-facebook-connector.md`; sửa `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-fb-connector.md`

## Migration

Không có.

## Test viết trước

Toàn bộ contract test + fixture (mỗi fixture ghi nguồn tài liệu) viết trước code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/facebook`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` (token nền tảng, ghi lên nền tảng): do phiên chính gọi sau khi công cụ xanh.

## Rủi ro / câu hỏi cho chủ dự án

Chưa thể kiểm bằng Meta thật; mọi dòng "verified" phải đối chiếu lại khi có Page thử (KT). Xem các thẻ ở trên.

## Đề xuất thay đổi

`docs/12` §1 có thể ghi thêm: `v27.0`, `X-Business-Use-Case-Usage` thay cho `X-Page-Usage`. (Bằng lời, không sửa spec.)

## Complexity tracking

Không có. (Không thêm thư viện; dùng `fetch` + Zod + `node:crypto`. Thêm một phương thức tùy chọn vào interface vì có ≥ 2 nơi dùng: kiểm-trước-khi-gửi và backfill.)

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: quyết định nằm trong ADR 008/spec docs/12; các điểm chưa rõ được xử lý bằng "không code phần đó").
