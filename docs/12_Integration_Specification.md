# 12 — Đặc tả tích hợp bên thứ ba

> Phiên bản 0.6 · 02/11/2026 (bổ sung: saas-core, feature flag, đối soát Shopify, bảo vệ Meta App, kiểm tra lại trước khi gửi) · Chỉ dùng **API chính thức**. Tên quyền, giới hạn và phiên bản API phải kiểm lại trên tài liệu nhà cung cấp tại thời điểm làm (các API này thay đổi thường xuyên). Ghim phiên bản Graph API trong cấu hình.

## 1. Meta — Facebook Page

| Mục | Chi tiết |
|---|---|
| Đăng nhập | Facebook Login for Business → user token → đổi long-lived → lấy Page token (`/me/accounts`) |
| Quyền | `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_metadata`; GĐ4 thêm `pages_messaging` |
| App Review | Cần duyệt các quyền trên + Business Verification; chuẩn bị video quay màn hình từng quyền |
| Webhook | Đăng ký `POST /{page-id}/subscribed_apps` với `subscribed_fields=feed` (GĐ5 thêm `messages`); xác minh `X-Hub-Signature-256` |
| Đọc | `GET /{post-id}/comments`, `GET /{page-id}/posts`, `GET /{page-id}/ads_posts` (bài quảng cáo/dark post — **chốt 02/11: bắt buộc**, quyền cụ thể cho `ads_posts` cần kiểm trên tài liệu Graph API hiện hành) |
| Trả lời bình luận | `POST /{comment-id}/comments {message}` |
| Ẩn/bỏ ẩn | `POST /{comment-id} {is_hidden: true|false}` |
| Nhắn riêng | `POST /{page-id}/messages {recipient: {comment_id}, message}` — 1 lần, trong 7 ngày |
| Messenger | `POST /{page-id}/messages`; trong 24 giờ: tự động được; 24 giờ–7 ngày: chỉ người, `messaging_type=MESSAGE_TAG`, `tag=HUMAN_AGENT`; quá 7 ngày: không gửi |
| Bắt buộc | Data deletion callback, deauthorize callback, Privacy Policy URL |

**Chống vòng lặp:** bỏ mọi sự kiện có `from.id == page_id`.
**Polling bù:** mỗi 5–15 phút lấy bình luận mới của bài có hoạt động 7 ngày gần nhất; upsert idempotent.
**Lỗi thường gặp:** mã 190 (token hết hạn) → kênh `expired` + banner; 10/200 (quyền) → `revoked`; 4/17/32/613 (rate limit) → backoff; 368 (bị chặn tạm) → **tạm khóa gửi kênh 24 giờ** + cảnh báo Owner/Admin.

**Một Meta App cho mọi khách — bảo vệ app** (chi tiết `09_System_Architecture.md` §11):

- Đọc header `X-App-Usage` và `X-Business-Use-Case-Usage` sau mỗi lệnh gọi; lưu mẫu vào `app_usage_samples`; ≥ 75% → giảm tốc toàn app, ≥ 90% → chỉ gửi câu do người bấm.
- Giới hạn tốc độ gửi theo Page/bài/nội dung lặp (token bucket Redis).
- Job `abuse` phát hiện lạm dụng; Admin tạm khóa gửi theo kênh/workspace.
- Điều khoản sử dụng cấm nội dung vi phạm chính sách Meta.
- Con số giới hạn ban đầu là giả định; đối chiếu tài liệu rate limit của Graph API hiện hành và điều chỉnh sau khi đo.

## 2. Meta — Instagram (bình luận GĐ4, tin nhắn GĐ5)

| Mục | Chi tiết |
|---|---|
| Kết nối | Tài khoản Instagram Business/Creator liên kết Page, hoặc Instagram Login **(chọn 1, cần kiểm)** |
| Quyền | `instagram_business_basic`, `instagram_business_manage_comments`; tin nhắn: `instagram_business_manage_messages` |
| Webhook | `comments`, `messages` |
| Trả lời | `POST /{ig-comment-id}/replies {message}` |
| Ẩn | `POST /{ig-comment-id} {hide: true}` |
| Giới hạn | Không trả lời được bình luận trên quảng cáo dạng dark post theo một số trường hợp **(cần kiểm)** |

## 3. TikTok (GĐ5, sớm hơn nếu được cấp quyền)

| Mục | Hiện biết (02/11/2026) |
|---|---|
| API | TikTok API for Business, nhóm Organic/Accounts API: danh sách bình luận và trả lời bình luận trên video của tài khoản Business (thư viện bám API có `business/comment/list`, `business/comment/reply/create`) |
| Ẩn bình luận | **Chưa thấy** trong API organic; Comments Manager trên Ads Manager ẩn được bình luận quảng cáo nhưng API cho phần này **cần kiểm** |
| Tin nhắn | Business Messaging API (gửi/nhận DM, tự động trả lời) |
| Điều kiện | Tài khoản TikTok Business; đăng ký developer API for Business; một số khu vực bị loại (EU, Anh, Thụy Sĩ — theo bên thứ ba) |
| Giới hạn (bên thứ ba ghi, cần đối chiếu) | Chỉ bình luận cấp 1 trên video của chính tài khoản; trả lời trong 48 giờ; tối đa 150 ký tự |
| Webhook | Cần kiểm; nếu không có thì polling theo `fetchComments` |

- Cần xác minh: API có cấp cho tài khoản Việt Nam không, endpoint ẩn, giới hạn tốc độ, quy trình duyệt app. Đăng ký từ GĐ0 vì thời gian duyệt chưa rõ.
- Connector TikTok khai báo hành động được phép (FR-016): thiếu `setHidden` thì UI ẩn nút Ẩn cho kênh TikTok, quy tắc spam chỉ đánh dấu; giới hạn 150 ký tự/48 giờ đưa vào `guard` và `sendRecheck`.
- Trước khi xác minh: UI hiển thị "Sắp ra mắt"; **không** dùng scraping hoặc API không chính thức.
- Kiến trúc: connector cắm thêm trong `packages/connectors/tiktok` theo interface chung (§9).

## 4. Nguồn sản phẩm bên ngoài (chốt thứ tự 02/11)

Thứ tự theo mức mở API: **Google Sheets (GĐ2) → Shopify (GĐ4) → Haravan → Sapo → KiotViet → Pancake POS (GĐ5)**. Tất cả dùng một interface connector kiến thức: `listProducts`, `getInventory`, `subscribeWebhooks?`, `reconcile`.

| Nguồn | API (đã tra 02/11) | Xác thực | Webhook | Ghi chú |
|---|---|---|---|---|
| Google Sheets | Google Sheets API (đọc) | OAuth Google, scope chỉ đọc bảng tính | Không; đồng bộ định kỳ | Scope bảng tính là scope nhạy cảm → cần xác minh app với Google trước khi mở cho khách ngoài |
| Shopify | Admin GraphQL | OAuth app | Có | §4.1 bên dưới |
| Haravan | Omni APIs `https://apis.haravan.com/com` ([docs](https://docs.haravan.com/docs/omni-apis/access-scopes/)) | OAuth; scope `com.read_products`, `com.read_inventories`; cài app để có token dài hạn | Có (`wh_api`, đăng ký trên Partners portal) | Gần giống Shopify |
| Sapo | Admin API kiểu `/admin/*.json` ([webhook](https://support.sapo.vn/sapo-webhook), [OAuth](https://support.sapo.vn/oauth)) | Sapo App / OAuth (cần kiểm chi tiết) | Có cho sản phẩm (`products/create|update|delete`); tồn kho chưa thấy | Polling tồn kho |
| KiotViet | Public API `https://public.kiotapi.com` | Client credentials (shop tạo Client ID/Secret + tên cửa hàng), token 1 giờ | Có (cần kiểm loại sự kiện) | Thông tin qua thư viện cộng đồng — đối chiếu tài liệu chính thức |
| Pancake POS | `https://pos.pages.fm/api/v1` | API key theo shop | Có (đơn hàng; sản phẩm cần kiểm) | **Chưa thấy tài liệu chính thức công khai** — xác minh trước khi làm |

**Chuẩn chung cho mọi nguồn (bổ sung 02/11):** connector ghi sản phẩm vào `products` và từng biến thể vào `product_variants` (FR-129), chuẩn hóa thuộc tính về `attrs_norm`, tăng `products.rev` khi giá/tồn/biến thể đổi (FR-135), và đánh dấu tính lại `search_text`/`name_embedding` (FR-127).

### 4.1 Shopify

| Mục | Chi tiết |
|---|---|
| Kiểu app | Custom/public app với OAuth; chỉ đọc |
| Scope | `read_products`, `read_inventory`, `read_legal_policies`, `read_content` |
| API | Admin GraphQL (ghim phiên bản) — `products`, `productVariants`, `inventoryLevels`, `shop.shopPolicies`, `pages` |
| Đồng bộ lần đầu | Bulk operation cho shop lớn; phân trang cursor cho shop nhỏ |
| Webhook | `products/create`, `products/update`, `products/delete`, `inventory_levels/update`, `app/uninstalled` |
| Bắt buộc (public app) | GDPR webhooks: `customers/data_request`, `customers/redact`, `shop/redact` |
| Ánh xạ | Variant → `products.variants`; giá/tồn → cột riêng (không vector); mô tả → `kb_chunks` |
| Khóa trường | Tên, giá, tồn từ Shopify → `locked_fields`, không sửa trong CommentFlow |
| Giá/tồn | Webhook cập nhật thẳng `products` (không qua bản nháp) + xóa cache câu trả lời liên quan |
| Đối soát | Hằng đêm + sau khi kết nối lại + nút "Đối soát ngay" (1 lần/giờ): so giá/tồn/trạng thái theo `external_id`, Shopify là nguồn đúng, ghi `reconcile_runs`/`reconcile_diffs`; kiểm danh sách webhook subscriptions và đăng ký lại nếu thiếu (chi tiết `09_System_Architecture.md` §7.3) |

## 5. Website chính sách (crawl URL)

- Owner dán URL → fetch (User-Agent riêng, tôn trọng robots.txt) → trích nội dung chính (Readability) → xem trước.
- Lịch kiểm tra lại: hằng ngày; nội dung đổi (`content_hash`) → hàng chờ duyệt có diff, **không tự xuất bản**.
- Giới hạn: chỉ domain Owner khai báo; tối đa N trang/workspace theo gói; timeout 15s; không chạy JS ở MVP.

## 6. LiteLLM

| Mục | Chi tiết |
|---|---|
| Vai trò | Cổng duy nhất gọi LLM |
| Virtual key | 1 key / workspace, `max_budget` theo tháng = trần chi phí AI |
| Model alias | `cf-classify` (model nhỏ), `cf-draft` (model soạn), `cf-fallback` |
| Cache | Redis semantic cache; khóa bao gồm `workspace_id` và `kb_version` |
| Fallback | Lỗi/timeout → alias dự phòng; vẫn lỗi → bình luận "Cần nhân viên" |
| Cấu hình | `infra/litellm/config.yaml` trong repo; secret qua env |

## 7. Langfuse

- Trace từng lượt: span theo bước pipeline, model, token, chi phí, `prompt_version`, `kb_version`.
- **Che PII trước khi gửi** (SĐT VN, email, địa chỉ cụ thể) bằng `packages/shared/maskPii`.
- Prompt management: lưu phiên bản prompt; dataset đánh giá đồng bộ với `evals/`.
- Tự host cùng VPS ở giai đoạn đầu; lưu 30 ngày.

## 8. Nhà cung cấp LLM

- **Chốt 02/11:** chọn nhà cung cấp theo kết quả bộ đánh giá (Anthropic, OpenAI, Google đều được); chạy qua LiteLLM từ GĐ0 để đổi model không sửa code. Ứng viên đầu: Claude Haiku 5.5, gpt-5-nano/mini, Gemini Flash-Lite. Dữ liệu gửi đi đã che PII; ghi nhà cung cấp và nơi xử lý trong chính sách quyền riêng tư.
- Theo dõi: giá theo token, cache read, ngưỡng tính giá ngữ cảnh dài.
- Hợp đồng/điều khoản: không dùng dữ liệu khách để huấn luyện (kiểm điều khoản API của nhà cung cấp).

## 9. Interface connector chung

```ts
interface PlatformConnector {
  platform: 'facebook' | 'instagram' | 'tiktok';
  verifyWebhook(req: Request): Promise<boolean>;
  parseWebhook(body: unknown): NormalizedEvent[];
  fetchComments(channel: Channel, since: Date): Promise<NormalizedComment[]>;
  reply(channel: Channel, commentId: string, text: string): Promise<{ externalId: string }>;
  setHidden(channel: Channel, commentId: string, hidden: boolean): Promise<void>;
  sendMessage?(channel: Channel, conv: Conversation, text: string, opts: { humanAgent: boolean }): Promise<{ externalId: string }>;
  privateReply?(channel: Channel, commentId: string, text: string): Promise<void>;
  mapError(e: unknown): PlatformError; // TOKEN_EXPIRED | PERMISSION | RATE_LIMIT | BLOCKED | UNKNOWN
}
```

## 10. Email & thanh toán

- Email giao dịch: nhà cung cấp SMTP/API (Resend, SES… — chọn theo chi phí); SPF/DKIM/DMARC cho domain.
- Thanh toán: chuyển khoản ngân hàng + VietQR; Admin xác nhận thủ công ở MVP. Cổng tự động (webhook ngân hàng/Casso/SePay…) xem xét sau khi có > 20 khách trả phí.

## 11. Môi trường tách biệt

| Tích hợp | dev | staging | prod |
|---|---|---|---|
| Meta App | App dev riêng, Page test | App dev, Page test | App production đã duyệt |
| Shopify | Dev store | Dev store | App thật |
| LiteLLM key | Key dev, ngân sách thấp | Key staging | Key prod |

Token production **không** có trên máy dev hoặc trong repo.
