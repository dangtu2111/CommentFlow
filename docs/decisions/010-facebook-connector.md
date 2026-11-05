# 010 — Connector Facebook Graph API (hợp đồng, chưa gọi Meta thật) (06/11/2026)

Trạng thái: **Đã áp dụng** ở `feat/fb-connector` (code + contract test bằng fixture; CHƯA đăng ký vào worker, CHƯA thử với Page thật). Căn cứ: `docs/12` §1, §9; ADR 008 (yêu cầu cho connector thật); ADR 007; FR-016, FR-042, FR-044.

## 1. Phiên bản và nguồn tài liệu (đọc 06/11/2026)

- **Graph API `v27.0`** — trang versioning ghi "mới nhất: v27.0", mỗi phiên bản dùng được tối thiểu 2 năm sau khi có phiên bản kế tiếp; luôn ghi phiên bản trong URL (gọi không phiên bản dùng mặc định trong App Dashboard). Cấu hình qua `apiVersion` (dạng `vNN.N`).
- Nguồn (developers.facebook.com, đọc 06/11/2026):
  - `/docs/graph-api/guides/versioning/` — phiên bản.
  - `/docs/graph-api/reference/object/comments/` — `GET /{object-id}/comments` (tham số `filter=toplevel|stream`, `summary`; mảng Comment; con trỏ `before/after`, `next`), `POST /{object-id}/comments` (`message`; phản hồi `{"id"}`; cần Page token của người có tác vụ MODERATE hoặc quyền `pages_manage_engagement`; với bình luận trên bài của Page, `id` chỉ trả cho người có tác vụ MODERATE).
  - `/docs/graph-api/reference/comment/` — `POST /{comment-id}` tham số `is_hidden` (bool, chỉ áp dụng bình luận trên Page), phản hồi `{success: bool}`; mã lỗi khi cập nhật: 200, 368, 100, 80001, 190, 210; khi đọc: 100, 80001, 200, 368, 190, 283, 2500, 459, 613, 210. Trường Comment: `id`, `can_comment`, `comment_count`, `parent`… (trường `from`/`message`/`created_time`/`can_hide`/`is_hidden` chỉ xác nhận gián tiếp, xem §4).
  - `/docs/graph-api/reference/page/subscribed_apps/` — `GET` (không tham số; `data[]` là Application kèm `subscribed_fields`), `POST` (`subscribed_fields` bắt buộc; phản hồi `{success}`), `DELETE` (cần App Access Token); cần Page token (tác vụ CREATE_CONTENT/MANAGE/MODERATE) + quyền `pages_manage_metadata`, `pages_show_list`.
  - `/docs/graph-api/reference/page/feed/` — `GET /{page-id}/feed` (`limit` ≤ 100; cần `pages_read_engagement` + `pages_read_user_content`; bài hết hạn không đọc được).
  - `/docs/graph-api/guides/error-handling/` — dạng lỗi (`message`, `type`, `code`, `error_subcode`, `fbtrace_id`) và bảng mã.
  - `/docs/graph-api/overview/rate-limiting/` — mã 4/17/32/613/80001; header `X-App-Usage` (`call_count`, `total_time`, `total_cputime`), `X-Business-Use-Case-Usage` (có `estimated_time_to_regain_access`, tính bằng phút) cho token Page; **không có `X-Page-Usage`**; Page token: 4800 × số người dùng tương tác 24 giờ.
  - `/docs/graph-api/guides/secure-requests/` — `appsecret_proof` = HMAC-SHA256(access token, app secret), gửi cùng mỗi lệnh; bắt buộc khi bật "Require App Secret".

## 2. Quyết định

- **Vị trí:** `packages/connectors/src/facebook/connector.ts` (`createFacebookConnector`). Chỉ `fetch` + Zod + `node:crypto` (không thêm thư viện). `fetch` được tiêm để test không cần mạng. **Chưa đăng ký vào sổ connector của worker** — chờ Page thử (gap `FB-CONNECTOR-REGISTER`).
- **Token:** lấy qua `TokenProvider` ngay trước mỗi lệnh; ghi (POST) đặt `access_token` + `appsecret_proof` trong THÂN `application/x-www-form-urlencoded` (không vào URL); đọc (GET) đặt trong tham số truy vấn (cách tài liệu dùng). Lỗi/log KHÔNG chứa URL, token, thân phản hồi hay thông báo của Meta.
- **Lỗi ra ngoài chỉ là mã:** `PlatformError` với `message` = `facebook_error_<code>` / `facebook_http_<status>` / `facebook_network_error` / `facebook_bad_response`…, KHÔNG `cause`. `mapError` giữ `PlatformError`, mọi thứ khác → `UNKNOWN`.
- **Kiểm id trước khi ghép đường dẫn:** mọi id (bình luận, bài, Page) phải khớp `^[0-9]{1,30}(_[0-9]{1,30}){0,2}# 010 — Connector Facebook Graph API (hợp đồng, chưa gọi Meta thật) (06/11/2026)

Trạng thái: **Đã áp dụng** ở `feat/fb-connector` (code + contract test bằng fixture; CHƯA đăng ký vào worker, CHƯA thử với Page thật). Căn cứ: `docs/12` §1, §9; ADR 008 (yêu cầu cho connector thật); ADR 007; FR-016, FR-042, FR-044.

## 1. Phiên bản và nguồn tài liệu (đọc 06/11/2026)

- **Graph API `v27.0`** — trang versioning ghi "mới nhất: v27.0", mỗi phiên bản dùng được tối thiểu 2 năm sau khi có phiên bản kế tiếp; luôn ghi phiên bản trong URL (gọi không phiên bản dùng mặc định trong App Dashboard). Cấu hình qua `apiVersion` (dạng `vNN.N`).
- Nguồn (developers.facebook.com, đọc 06/11/2026):
  - `/docs/graph-api/guides/versioning/` — phiên bản.
  - `/docs/graph-api/reference/object/comments/` — `GET /{object-id}/comments` (tham số `filter=toplevel|stream`, `summary`; mảng Comment; con trỏ `before/after`, `next`), `POST /{object-id}/comments` (`message`; phản hồi `{"id"}`; cần Page token của người có tác vụ MODERATE hoặc quyền `pages_manage_engagement`; với bình luận trên bài của Page, `id` chỉ trả cho người có tác vụ MODERATE).
  - `/docs/graph-api/reference/comment/` — `POST /{comment-id}` tham số `is_hidden` (bool, chỉ áp dụng bình luận trên Page), phản hồi `{success: bool}`; mã lỗi khi cập nhật: 200, 368, 100, 80001, 190, 210; khi đọc: 100, 80001, 200, 368, 190, 283, 2500, 459, 613, 210. Trường Comment: `id`, `can_comment`, `comment_count`, `parent`… (trường `from`/`message`/`created_time`/`can_hide`/`is_hidden` chỉ xác nhận gián tiếp, xem §4).
  - `/docs/graph-api/reference/page/subscribed_apps/` — `GET` (không tham số; `data[]` là Application kèm `subscribed_fields`), `POST` (`subscribed_fields` bắt buộc; phản hồi `{success}`), `DELETE` (cần App Access Token); cần Page token (tác vụ CREATE_CONTENT/MANAGE/MODERATE) + quyền `pages_manage_metadata`, `pages_show_list`.
  - `/docs/graph-api/reference/page/feed/` — `GET /{page-id}/feed` (`limit` ≤ 100; cần `pages_read_engagement` + `pages_read_user_content`; bài hết hạn không đọc được).
  - `/docs/graph-api/guides/error-handling/` — dạng lỗi (`message`, `type`, `code`, `error_subcode`, `fbtrace_id`) và bảng mã.
  - `/docs/graph-api/overview/rate-limiting/` — mã 4/17/32/613/80001; header `X-App-Usage` (`call_count`, `total_time`, `total_cputime`), `X-Business-Use-Case-Usage` (có `estimated_time_to_regain_access`, tính bằng phút) cho token Page; **không có `X-Page-Usage`**; Page token: 4800 × số người dùng tương tác 24 giờ.
  - `/docs/graph-api/guides/secure-requests/` — `appsecret_proof` = HMAC-SHA256(access token, app secret), gửi cùng mỗi lệnh; bắt buộc khi bật "Require App Secret".

## 2. Quyết định

- **Vị trí:** `packages/connectors/src/facebook/connector.ts` (`createFacebookConnector`). Chỉ `fetch` + Zod + `node:crypto` (không thêm thư viện). `fetch` được tiêm để test không cần mạng. **Chưa đăng ký vào sổ connector của worker** — chờ Page thử (gap `FB-CONNECTOR-REGISTER`).
- **Token:** lấy qua `TokenProvider` ngay trước mỗi lệnh; ghi (POST) đặt `access_token` + `appsecret_proof` trong THÂN `application/x-www-form-urlencoded` (không vào URL); đọc (GET) đặt trong tham số truy vấn (cách tài liệu dùng). Lỗi/log KHÔNG chứa URL, token, thân phản hồi hay thông báo của Meta.
- **Lỗi ra ngoài chỉ là mã:** `PlatformError` với `message` = `facebook_error_<code>` / `facebook_http_<status>` / `facebook_network_error` / `facebook_bad_response`…, KHÔNG `cause`. `mapError` giữ `PlatformError`, mọi thứ khác → `UNKNOWN`.
 (id Graph: `pageId`, `pageId_postId`, `postId_commentId`); sai → `UNKNOWN` `facebook_invalid_id` (mã không chứa id), KHÔNG gọi provider token, KHÔNG gọi mạng. Không còn ghép chuỗi lạ vào đường dẫn (`.`, `..`, `../x`, `?`, `#`, khoảng trắng bị chặn).
- **Timeout:** `AbortSignal.timeout` cho từng lệnh, mặc định 30 giây, tối đa 60 giây. `redirect: 'error'`.
- **Tổng thời hạn thao tác nhiều trang:** `fetchReplies`/`fetchPostComments` dùng MỘT `AbortSignal` chung cho cả vòng phân trang (`totalTimeoutMs`, mặc định và tối đa **45 giây**) kết hợp với timeout từng lệnh; vượt → `UNKNOWN`. `fetchReplies` (đường kiểm-trước-khi-gửi-lại) mặc định tối đa **5 trang** (`maxReplyPages`, ≤ 500 trả lời), `fetchPostComments` 20 trang. **Ngân sách job `send`:** kiểm trước ≤ 45 giây + `reply` ≤ 30 giây = 75 giây < thuê 90 giây (test khóa bất đẳng thức này).
- **Giới hạn thân phản hồi:** đọc luồng, tối đa 2 MB (`MAX_RESPONSE_BYTES`; cũng từ chối sớm theo `Content-Length`); vượt → `facebook_bad_response`.
- **Che token ở đường lỗi:** test quét `message`, `stack`, `cause` và mọi thuộc tính của lỗi cho mọi kịch bản lỗi GET/POST (mạng lỗi chứa URL, 4xx/5xx, thân rác): không có token, `appsecret_proof`, `access_token`, `graph.facebook.com`. Bước GET vẫn đặt token trong query (cách tài liệu dùng) — test khóa hành vi này; POST không có gì trong URL.
- **Không retry ngầm; không khóa idempotent phía Meta:** mỗi lệnh đúng một lần gọi. Chống gửi trùng là việc của job `send` (kiểm `fetchReplies` trước khi gửi lại). Lỗi mạng/timeout/5xx/thân 2xx không đọc được ở bước ghi → `UNKNOWN` ("không biết đã thực hiện chưa").
- **Phân loại lỗi** (theo `error.code`, kể cả khi HTTP 200; HTTP 429 không thân JSON → RATE_LIMIT):

| Mã Graph | Mã chuẩn | Nguồn |
|---|---|---|
| 190 (mọi `error_subcode`: 458/460/463/467…), 102 | `TOKEN_EXPIRED` | error-handling |
| 10, 200–299 (gồm 283) | `PERMISSION` | error-handling |
| 4, 17, 32, 613, 80001, 341 | `RATE_LIMIT` (+ `retryAfterSeconds` từ `X-Business-Use-Case-Usage`, tối đa 24 giờ) | rate-limiting, error-handling |
| 368 | `BLOCKED` | error-handling, comment |
| còn lại (kể cả 100, 1, 2) | `UNKNOWN` | — |

- **Thao tác:** `reply` = `POST /{comment-id}/comments` `message`; `setHidden` = `POST /{comment-id}` `is_hidden=true|false` (không có xóa); `fetchReplies` = `GET /{comment-id}/comments` đọc ĐỦ các trang bằng con trỏ `after` (không đi theo URL `next`; vượt `maxPages` hoặc `next` thiếu `after` → lỗi, không trả thiếu); `fetchPostComments` = `GET /{post-id}/comments?filter=stream` lọc `since` phía mình; `getPageSubscription`/`subscribePage` = `/{page-id}/subscribed_apps` (`subscribed_fields=feed`, trường mà `parseMetaWebhook` đang xử lý); `verifyWebhook`/`parseWebhook` dùng lại `webhook.ts`.
- **Khai báo khả năng:** reply/hide/unhide theo `docs/12` §1; **nhắn riêng và Messenger khai `supported:false`** (chưa làm, chưa đọc tài liệu) để khớp hợp đồng "có phương thức ⇔ khai báo hỗ trợ".
- **Interface:** thêm `fetchReplies?` (tùy chọn) vào `PlatformConnector` — dùng cho kiểm-trước-khi-gửi-lại và backfill.

## 3. Giới hạn / gap

- `FB-CONNECTOR-REGISTER`: đăng ký connector vào worker + truyền `appId`/`appSecret` (do nơi dựng lấy từ cấu hình) — sau khi có Page thử.
- **Điều kiện BẮT BUỘC trước `FB-CONNECTOR-REGISTER`** (verifier-security 06/11/2026): làm đủ các gap dưới đây + `SEND-SWEEP` + `HIDE-SWEEP`.
- `SEND-FIND-REPLY-BY-PARENT` (làm ở nhánh `FB-CONNECTOR-REGISTER`, cùng lúc nối connector): `findExistingReply` trong `apps/worker/src/jobs/send.ts` đang gọi `fetchComments(channel, since)` rồi lọc theo cha; connector thật ném `UNKNOWN` ở `fetchComments` → worker PHẢI đổi sang `fetchReplies(channel, comment_external_id)` khi nối connector (nếu không, kiểm trước bị `UNKNOWN`, job giữ `sending` và hết lượt → `failed UNKNOWN`: an toàn nhưng không gửi được lại).
- `FB-FETCH-PAGE-WIDE` (cho `POLLING-BACKFILL`/`FB-BACKFILL`): quét cả Page theo `since` — tài liệu chỉ cho `feed` (lọc theo bài, `limit` ≤ 100); chưa định nghĩa quét bài nào/bao nhiêu và chi phí rate limit. Chưa code.
- **`PERMISSION` theo đối tượng (đã sửa ở nhánh này):** `send.ts` KHÔNG còn đổi kênh sang `revoked` khi `PERMISSION` ở lệnh gửi MỘT bình luận — chỉ `TOKEN_EXPIRED` đổi trạng thái kênh; yêu cầu ghi `failed` mã `PERMISSION` (test `send.int.test.ts` cập nhật). Gap `PLATFORM-ERROR-REJECTED`: connector thật cần phân biệt "token thiếu quyền" (cả kênh) với "từ chối theo đối tượng" (bình luận bị xóa/không trả lời được/không ẩn được) — thêm mã chuẩn mới (ví dụ `REJECTED`) vào `PLATFORM_ERROR_CODES` ở bước sau (ảnh hưởng worker).
- **Khi `from` thiếu:** bình luận thiếu `from` ⇒ "không chắc" ⇒ `findExistingReply` phải kết luận `failed UNKNOWN` (KHÔNG gửi lại); cân nhắc khớp thêm theo `externalId`/chuẩn hóa văn bản (khoảng trắng, liên kết, emoji). Làm ở nhánh `FB-CONNECTOR-REGISTER`.
- `BLOCKED` (368) trong `send.ts` chưa đặt `send_suspended_until` 24 giờ (`SEND-SUSPEND-ADMIN`) — xử lý khi đăng ký connector.
- Route webhook Meta khi đăng ký connector: đã có giới hạn thân 256 KB ở route Meta (`apps/web`) — xác nhận lại khi nối.
- `X-Page-Usage` không tồn tại trong tài liệu (dùng `X-Business-Use-Case-Usage`): đề xuất sửa `docs/12` §1 (bằng lời; không tự sửa `docs/01–16`).
- Mã `100` (ví dụ bình luận đã bị xóa/không ẩn được) rơi vào `UNKNOWN`; đề xuất thêm mã chuẩn (ví dụ `REJECTED`) — đổi `PLATFORM_ERROR_CODES` ảnh hưởng worker, để bước sau.
- Chưa có: `DELETE subscribed_apps` (cần App Access Token), nhắn riêng, Messenger, đọc `can_hide`, ghi nhận mức dùng (`X-App-Usage`/BUC) để làm chậm chủ động (`SEND-RATE-LIMIT`).

## 4. Chỗ tài liệu không rõ — phải kiểm bằng Page thật (KT-012)

- Trường `from`, `message`, `created_time` của Comment không có trong bản tiếng Việt của trang Comment mà đã đọc (chỉ thấy gián tiếp qua trang tham chiếu bản khác + webhook); `from` có thể vắng nếu Page thiếu tác vụ MODERATE → `isFromPage=false` → kiểm-trước có thể không nhận ra câu của Page (nguy cơ gửi trùng).
- `appsecret_proof` dạng hex thường (trang không nêu định dạng; ví dụ PHP `hash_hmac` mặc định hex).
- Hành vi `filter=stream` và `GET /{comment-id}/comments` với trả lời lồng; `subscribed_fields` nhận `feed` dạng danh sách phân tách bằng dấu phẩy.
- Mọi fixture trong `connector.fixtures.ts` do VIẾT TAY theo tài liệu (ghi nguồn từng mẫu), chưa là kết quả từ Meta thật.
