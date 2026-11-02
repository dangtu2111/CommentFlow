# 11 — Đặc tả API

> Phiên bản 0.5 · 02/11/2026 (endpoint cho FR-121–165: biến thể, bí danh, bảng size, kb_gaps, câu mẫu, độ sẵn sàng, connector chung; bổ sung: saas-core, feature flag, đối soát Shopify, bảo vệ Meta App, kiểm tra lại trước khi gửi) · API nội bộ (web ↔ client) là **đề xuất**; route đã có trong source giữ nguyên tên và bổ sung theo bảng này **(cần đối chiếu source)**. Đây không phải API công khai cho bên thứ ba.

## 1. Quy ước chung

- Base: `/api/v1`. JSON UTF-8. Thời gian ISO 8601 có múi giờ.
- Xác thực: cookie phiên (httpOnly, Secure, SameSite=Lax) + CSRF token cho phương thức ghi.
- Workspace: header `X-Workspace-Id`; server kiểm thành viên rồi đặt `app.workspace_id` cho RLS.
- Phân trang: cursor — `?cursor=...&limit=50` → `{ data: [], next_cursor }`.
- Validate bằng Zod (schema dùng chung ở `packages/shared`).
- Lỗi:

```json
{ "error": { "code": "CHANNEL_DISCONNECTED", "message": "Page mất kết nối.", "details": {} } }
```

| HTTP | Khi nào |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | Chưa đăng nhập / phiên hết hạn |
| 403 | `FORBIDDEN` (sai vai trò), `PLAN_LIMIT` |
| 404 | Không có hoặc không thuộc workspace |
| 409 | `LOCKED_BY_OTHER`, `ALREADY_REPLIED`, `VERSION_CONFLICT` |
| 422 | `WINDOW_EXPIRED`, `QUOTA_EXCEEDED`, `PRICE_CHANGED` (giá đổi sau khi soạn — client hỏi xác nhận rồi gửi lại với `confirm_price_change: true`), `SEND_SUSPENDED` |
| 429 | Rate limit |
| 502 | `PLATFORM_ERROR` (kèm mã gốc nền tảng) |

## 2. Xác thực & tài khoản

| Method | Path | Mô tả | Vai trò |
|---|---|---|---|
| POST | `/auth/signup` | `{email, password, name}` → tạo user + workspace trial | công khai |
| POST | `/auth/login` | → phiên, hoặc `{need_2fa: true}` | công khai |
| POST | `/auth/2fa/verify` | `{code}` | phiên tạm |
| POST | `/auth/2fa/setup` / `enable` / `disable` | TOTP + mã dự phòng | đăng nhập |
| POST | `/auth/logout` | | đăng nhập |
| GET | `/me` | user + danh sách workspace + vai trò + sản phẩm đã đăng ký + flag đang bật cho workspace hiện tại | đăng nhập |

## 3. Workspace & thành viên

| Method | Path | Mô tả | Vai trò |
|---|---|---|---|
| GET/PATCH | `/workspace` | Tên, múi giờ, ngôn ngữ mặc định | Owner (PATCH) |
| GET | `/members` | | Owner, Staff |
| POST | `/members/invite` | `{email, role}` | Owner |
| PATCH/DELETE | `/members/:id` | Đổi vai trò / xóa | Owner |
| POST | `/workspace/emergency-stop` | Tắt mọi tự động | Owner, Staff |
| POST | `/workspace/emergency-resume` | | Owner |

## 4. Kênh

| Method | Path | Mô tả |
|---|---|---|
| GET | `/channels` | Danh sách + trạng thái |
| GET | `/channels/oauth/:platform/start` | Redirect OAuth (state chống CSRF) |
| GET | `/channels/oauth/:platform/callback` | Đổi code → danh sách Page/tài khoản (lưu tạm) |
| POST | `/channels` | `{platform, external_ids[]}` → kết nối, kiểm giới hạn gói |
| PATCH | `/channels/:id` | `reply_language`, tên hiển thị |
| POST | `/channels/:id/reconnect` | |
| DELETE | `/channels/:id` | Ngắt kết nối, gỡ webhook |

## 5. Bình luận

| Method | Path | Mô tả |
|---|---|---|
| GET | `/comments` | Lọc `status, label, channel_id, platform, post_id, q, lang`; bổ sung 02/11: `action` (answer/clarify/redirect/handoff), `needs_followup`, `impersonation`, `has_attachments`; bình luận đã gộp trả trong `merged[]` của bình luận cuối |
| GET | `/comments/:id` | Chi tiết + bài + sản phẩm gắn + draft + lịch sử |
| POST | `/comments/:id/lock` | Khóa mềm 2 phút, gia hạn khi gõ → 409 nếu người khác giữ |
| DELETE | `/comments/:id/lock` | |
| POST | `/comments/:id/reply` | `{text, draft_id?}` → `202 {status: "sending"}` |
| POST | `/comments/:id/retry` | Kiểm tra đã gửi chưa rồi mới gửi lại |
| PATCH | `/comments/:id/label` | `{label}` → `label_source=human` |
| POST | `/comments/:id/hide` / `unhide` | |
| POST | `/comments/:id/skip` | `{reason?}` |
| POST | `/comments/:id/private-reply` | `{text}` — 1 lần, ≤ 7 ngày (GĐ5) |
| POST | `/comments/:id/regenerate` | Soạn lại (tính 1 lượt) |
| POST | `/comments/bulk` | `{ids[], action: hide|skip|label}` |

Ví dụ:

```http
POST /api/v1/comments/7b1e.../reply
X-Workspace-Id: 0c2a...
{ "text": "Dạ áo size M còn hàng ạ, giá 289.000đ.", "draft_id": "a91f..." }

202 { "status": "sending", "comment_id": "7b1e..." }
```

## 6. Tin nhắn (GĐ5)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/conversations` | Lọc `window_state, assigned_to, ai_enabled`; tab `expiring` |
| GET | `/conversations/:id/messages` | Tối đa 50, cursor |
| POST | `/conversations/:id/messages` | `{text}`; ngoài 24 giờ → tự gắn `HUMAN_AGENT` nếu ≤ 7 ngày; quá → 422 `WINDOW_EXPIRED` |
| PATCH | `/conversations/:id` | `{ai_enabled, assigned_to, status}` |

## 7. Bài viết & sản phẩm

| Method | Path | Mô tả |
|---|---|---|
| GET | `/posts` | Lọc `platform, channel_id, mapped=false`, sắp `pending_count` |
| GET | `/posts/:id` | + sản phẩm gắn, ghi chú, gợi ý AI |
| PUT | `/posts/:id/products` | `{items: [{product_id, is_primary}]}` |
| POST | `/posts/bulk-map` | `{post_ids[], product_ids[]}` |
| POST/PATCH/DELETE | `/posts/:id/notes[/:noteId]` | `{content, valid_from, valid_to}` |
| PUT | `/posts/:id/automation` | Ghi đè chế độ tự động |
| GET/POST/PATCH | `/products[/:id]` | Trường khóa (từ Shopify) trả 409 khi sửa |
| POST | `/products/import` | Excel/CSV + ánh xạ cột → bản nháp |
| GET/PUT | `/products/:id/variants` | Biến thể (size, màu, giá, tồn); trường khóa từ nguồn đồng bộ trả 409 (FR-129) |
| GET/POST/DELETE | `/products/:id/aliases[/:aliasId]` | Bí danh; `GET /aliases/suggestions` → gợi ý chờ xác nhận, `POST /aliases/suggestions/:id/accept` (FR-128) |
| GET | `/products/search?q=` | Tìm gần đúng theo `10` §5.1, trả điểm (dùng cho ProductPicker và Thử AI) (FR-127) |
| GET/POST/PATCH/DELETE | `/size-charts[/:id]` | Bảng size theo sản phẩm/danh mục (FR-149) |
| GET | `/posts/:id/price-mentions` | Số tiền trong caption/quảng cáo + `matches_stock` (FR-150) |

## 8. Kiến thức

| Method | Path | Mô tả |
|---|---|---|
| GET/POST/PATCH/DELETE | `/kb/sources[/:id]` | Nguồn thủ công, FAQ, file, URL |
| POST | `/kb/sources/url/preview` | `{url}` → văn bản trích xem trước |
| POST | `/kb/sources/:id/sync` | Đồng bộ ngay (single-flight → 409 nếu đang chạy) |
| GET | `/kb/changes` | Thay đổi chờ duyệt (diff) |
| POST | `/kb/changes/:id/accept` / `reject` | |
| POST | `/kb/test` | `{question, channel_id?, post_id?}` → `{label, confidence, reply, sources, auto_send: {allowed, failed_gate, reason}}`; bổ sung 02/11: `labels[]`, `extracted`, `action`, `claims[]`, `unanswered_topics[]`, `variants[]`, `confidence_components`, `route` |
| GET/POST/DELETE | `/kb/tests[/:id]` | Bộ câu kiểm thử; `POST /kb/tests/run` |
| POST | `/kb/publish` | `{note}` → `{version, affected_labels}` |
| GET | `/kb/versions` · POST `/kb/versions/:id/restore` | |
| GET/PUT | `/kb/brand-voice` | Theo `lang`; bổ sung 02/11: `shop_pronoun`, `customer_address`, `handoff_templates` (trong/ngoài giờ), `address_by_name` (FR-142, FR-152, FR-161) |
| GET/POST/DELETE | `/kb/abbreviations` | |
| GET | `/kb/gaps` | Câu hỏi AI chưa trả lời được, lọc `topic, product_id, status`; `POST /kb/gaps/:id/resolve` · `/ignore` (FR-141, FR-134) |
| GET/PATCH | `/kb/examples[/:id]` | Câu mẫu của shop; `PATCH {status: active/disabled}` (FR-132) |
| GET | `/kb/readiness?lang=` | Độ sẵn sàng: checklist + tỉ lệ câu mẫu đạt + điểm (FR-146) |
| GET | `/kb/review/injection` | Đoạn bị đánh dấu nghi cài lệnh; `POST …/:chunkId/approve` · `/reject` (FR-164) |
| GET | `/kb/retrieval-logs?draft_id=` | Ứng viên + điểm từng nhánh cho ô Thử AI (FR-134) |
| GET | `/integrations/:provider/start` · `/callback` | OAuth/kết nối chung cho `google_sheets`, `haravan`, `sapo`, `kiotviet`; `pancake` nhập API key (FR-121, FR-122) |
| POST | `/integrations/:provider/:id/sync` | Đồng bộ ngay (single-flight → 409); `PUT …/:id` `{sync_interval, sheet_id, tab, column_map}` cho Google Sheets |
| GET | `/integrations/shopify/start` · `/callback` | OAuth Shopify |
| POST | `/integrations/shopify/:id/reconcile` | Đối soát ngay (1 lần/giờ → 429) |
| GET | `/integrations/shopify/:id/reconcile-runs` | Lịch sử đối soát + danh sách lệch |

## 9. Tự động hóa

| Method | Path | Mô tả |
|---|---|---|
| GET | `/automation/settings?target=comment|message` | Ma trận kênh × nhãn |
| PUT | `/automation/settings` | `{items: [{scope, scope_id, label, lang, mode, threshold, delay_seconds, daily_cap, allow_partial, allow_clarify, merge_window_seconds, stock_stale_days, human_hold_minutes, suggest_alternatives}]}` (trường bổ sung 02/11: FR-120, 141, 147, 148, 151, 154, 157); chuyển sang `auto` cũng bị chặn 422 `NOT_READY` khi Độ sẵn sàng < 80% (FR-146); chuyển sang `auto` → server kiểm đủ 50 mẫu & sửa ≤ 10%, nếu không → 422 `NOT_CALIBRATED` |
| GET | `/automation/calibration` | Theo bucket: số mẫu, tỷ lệ sửa, ngưỡng đề xuất + lý do |
| GET | `/automation/events` | Lọc `event, label, channel_id` |
| POST | `/automation/scheduled/:draftId/cancel` | Hủy trong khoảng trễ |
| POST | `/automation/drafts/:id/mark-wrong` | `{reason}` |

## 10. Spam, khách tiềm năng, báo cáo, nhật ký

| Method | Path | Mô tả |
|---|---|---|
| GET/POST/PATCH/DELETE | `/rules[/:id]` | |
| POST | `/rules/preview` | `{type, pattern}` → số khớp 7 ngày + ví dụ |
| GET/PATCH | `/leads[/:id]` | `stage, assigned_to, note` |
| GET | `/leads/export` | Excel (job; trả link) |
| GET | `/reports/summary?from&to&channel_id` | KPI |
| GET | `/reports/timeseries?metric&from&to` | |
| GET | `/logs` | `action_logs`, chỉ đọc |

## 11. Thanh toán & hạn mức

| Method | Path | Mô tả |
|---|---|---|
| GET | `/billing?product=commentflow` | Gói, kỳ, lượt đã dùng, dự báo ngày hết (theo sản phẩm; saas-core) |
| POST | `/billing/checkout` | `{plan_code | addon}` → hóa đơn `pending` + QR + `transfer_code` |
| GET | `/billing/invoices` | |

## 12. Quyền riêng tư

| Method | Path | Mô tả |
|---|---|---|
| POST | `/privacy/export` | Job → email link hết hạn |
| POST | `/privacy/delete-workspace` | Xác nhận nhập tên + 2FA |
| GET | `/api/public/deletion-status/:code` | Trang tra cứu công khai |

## 13. Webhook vào (công khai, xác minh chữ ký)

| Method | Path | Xác minh |
|---|---|---|
| GET | `/api/webhooks/meta` | `hub.verify_token` → trả `hub.challenge` |
| POST | `/api/webhooks/meta` | `X-Hub-Signature-256` (HMAC-SHA256 app secret) |
| POST | `/api/webhooks/shopify` | `X-Shopify-Hmac-Sha256` |
| POST | `/api/webhooks/tiktok` | Chữ ký theo tài liệu TikTok (cần kiểm; nếu TikTok không có webhook bình luận thì dùng polling, không có route này) |
| POST | `/api/meta/data-deletion` | `signed_request` → `{ "url": ".../deletion-status/ABC123", "confirmation_code": "ABC123" }` |
| POST | `/api/meta/deauthorize` | `signed_request` → đánh dấu kênh `revoked` |

Mọi webhook: ghi `webhook_events` (unique `event_hash`) → enqueue → trả 200 ngay.

## 14. Admin (`/api/admin/*`, role admin + 2FA)

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| GET | `/admin/overview` | KPI hệ thống | mọi admin |
| GET | `/admin/workspaces` · `/:id` | Danh sách, chi tiết | mọi admin |
| POST | `/admin/payments/match` | `{statement_text}` → workspace/hóa đơn khớp | finance, super |
| POST | `/admin/payments/confirm` | `{invoice_id, amount_vnd, bank_ref}` | finance, super |
| GET | `/admin/margins` | Lãi gộp theo workspace | finance, super |
| PATCH | `/admin/workspaces/:id/ai-cap` | Trần chi phí AI | super |
| POST | `/admin/impersonate` | `{workspace_id, reason}` → phiên chỉ đọc 30 phút | support, super |
| GET | `/admin/dead-letters` · POST `/:id/retry` / `skip` | Job lỗi | super |
| GET | `/admin/audit` | Nhật ký admin | super |
| GET | `/admin/flags` | Danh sách flag + số workspace bật | mọi admin |
| PATCH | `/admin/flags/:key` | `{default_on, rollout_percent, plans}` | super |
| PUT/DELETE | `/admin/flags/:key/overrides/:workspaceId` | `{enabled, reason}` | super |
| POST | `/admin/channels/:id/suspend-send` | `{hours, reason}` — tạm khóa gửi kênh | support, super |
| POST | `/admin/workspaces/:id/suspend-send` | Tạm khóa gửi cả workspace | super |
| DELETE | `/admin/channels/:id/suspend-send` | Mở lại | super |
| GET | `/admin/meta-health` | % dùng app, lỗi theo mã, `abuse_signals` chưa xử lý | mọi admin |
| POST | `/admin/abuse-signals/:id/resolve` | `{note}` | support, super |

## 15. Dịch vụ `ml` (nội bộ, chỉ mạng Docker)

Header `Authorization: Bearer <ML_TOKEN>`.

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/embed` | `{texts: string[]}` (≤ 64) | `{vectors: number[][], model, dim: 1024}` |
| POST | `/rerank` | `{query, docs: string[]}` | `{scores: number[]}` |
| POST | `/classify` | `{text, lang}` | `{label, confidence, model_version}` |
| POST | `/normalize` | `{text, workspace_id}` | `{normalized, expansions[]}` |
| POST | `/detect-lang` | `{text, prev_lang?, channel_default?}` | `{lang: "vi"|"en", rule: 1..5, confidence}` |
| GET | `/health` | | `{ok, models: {...}}` |

## 16. Realtime

`GET /api/v1/stream` (SSE) — sự kiện `comment.created`, `comment.updated`, `comment.locked`, `message.created`, `automation.paused`, `usage.warning`, `channel.status`, `send.cancelled` (kèm `gate = recheck:R#`), `reconcile.finished`.

## 17. Phân chia saas-core

Route thuộc saas-core (dùng chung ExcelFlow): §2 Xác thực, §3 Workspace & thành viên (trừ `emergency-*`), §11 Thanh toán, §12 Quyền riêng tư, phần Admin về workspace/thanh toán/flags. Route còn lại thuộc CommentFlow, đặt dưới `/api/v1/` nhưng logic ở `packages/ai`, `packages/connectors` và route của sản phẩm **(hoặc tiền tố `/api/v1/cf/` nếu muốn tách rõ — chốt khi đối chiếu source)**.
