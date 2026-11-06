# Cần bạn cung cấp / thiết lập (chủ dự án)

> Những thứ agent **không tự làm được** vì cần tài khoản, bí mật hoặc thao tác ngoài repo. Agent chỉ thêm **tên biến** vào `env.example`; **giá trị thật bạn tự đặt trong `.env.local`** (không bao giờ commit, không gửi cho agent). Cập nhật file này khi có mục mới.

## 1. Meta App (đăng nhập Facebook + webhook bình luận) — `FB-OAUTH`, `WH-INGEST`

Bạn đã có Meta App ở chế độ **Development** (không cần tên miền thật, chưa cần App Review khi thử với tài khoản quản trị/tester của chính App).

### 1.1 Cấu hình App (một lần)
1. Trong Meta for Developers → App → **Facebook Login for Business** (hoặc Facebook Login): thêm vào **Valid OAuth Redirect URIs**:
   `http://localhost:3000/api/channels/facebook/callback`
   (Meta cho phép `http://localhost` ở chế độ Development. Cổng/đường dẫn đúng như trên; nếu tôi đổi đường dẫn khi code, sẽ cập nhật mục này.)
2. Thêm sản phẩm **Webhooks** → đối tượng **Page** → đăng ký trường `feed` (bình luận trên bài của Page; xem `docs/12` §1). Trường `messages` để sau (GĐ5).
3. Quyền cần xin khi thử (chế độ Development chỉ dùng được với người có vai trò trong App): `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_metadata` (xem `docs/12` §1). Người thử phải là **Admin/Developer/Tester của App** và quản trị **Page thử**.
4. Chuẩn bị **một Page thử** (Page thật của bạn hoặc Page lập riêng để thử) có vài bài viết.

### 1.2 Biến môi trường (bạn đặt giá trị vào `.env.local`)
Tên biến có trong `env.example` (không có giá trị):

| Biến | Là gì | Lấy ở đâu |
|---|---|---|
| `META_APP_ID` | ID của Meta App | App → Settings → Basic |
| `META_APP_SECRET` | App Secret (dùng đổi token + **xác minh chữ ký webhook**) | App → Settings → Basic → Show |
| `META_WEBHOOK_VERIFY_TOKEN` | Chuỗi bí mật do **bạn tự chọn** (dài, ngẫu nhiên) để Meta xác minh endpoint webhook | Tự sinh, ví dụ `openssl rand -hex 24`; dán cùng giá trị vào ô "Verify token" ở Meta |
| `META_OAUTH_REDIRECT_URL` | Redirect URI dùng khi đăng nhập (mặc định `http://localhost:3000/api/channels/facebook/callback`) | Phải **trùng khớp từng ký tự** với mục 1.1.1 |

Không dán App Secret/verify token vào chat, issue, log hay commit.

### 1.3 Khóa mã hóa token Page (`TOKEN_ENC_KEYS`) — `TOKEN-ENC`, `FB-OAUTH`
Token Page được mã hóa AES-256-GCM trước khi vào DB; **mất khóa = mọi kênh phải kết nối lại**.

1. Sinh khóa: `openssl rand -hex 32` (64 ký tự hex). Không có `openssl`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Khóa **dev**: đặt vào `.env.local` (máy code): `TOKEN_ENC_KEYS=v1:<64 hex>`. **Chỉ** ở máy code — **không** đặt trên máy ảo, không commit, không dán vào chat/issue/log.
3. **Sao lưu khóa riêng** (trình quản lý mật khẩu), tách khỏi nơi sao lưu DB — có DB mà không có khóa thì token vô dụng.
4. Xoay khóa (sau này): thêm `v2:<hex mới>` phía sau (`v1:…,v2:…`); token mới mã hóa bằng v2, token cũ vẫn đọc được bằng v1; chỉ gỡ v1 sau khi mọi kênh đã mã hóa lại.
5. Staging/production: khóa **riêng** cho từng môi trường, không dùng lại khóa dev. Khóa **staging** do script `infra/scripts/gen-staging-env.sh` sinh ngay trên máy ảo (`docs/STAGING_SETUP.md` bước B), chỉ nằm ở file `.env.cf-staging` trên máy ảo + **một** bản sao trong trình quản lý mật khẩu của chủ dự án. **Không chép chéo**: khóa dev không lên máy ảo, khóa staging không về máy code. Production: secret manager riêng (làm khi tới `DEPLOY`).

### 1.4 Meta OAuth + Page thử — `FB-OAUTH` (mã KT-014)

Code đã xong ở chế độ "Xong-mock" (test bằng dữ liệu mẫu theo tài liệu Meta v27.0; **chưa gọi Meta thật**). Muốn chạy thật:

- **Là gì:** Meta App (Facebook Login for Business) + một Page thử, để Owner bấm "Kết nối Facebook" lấy token Page và đăng ký webhook.
- **Lấy ở đâu (từng bước):**
  1. Làm mục 1.1 (Redirect URI, Webhooks `feed`, quyền). Với **Facebook Login for Business**, vào Meta → App → Facebook Login for Business → **Configurations** → tạo cấu hình có các quyền ở 1.1.3, lấy **Configuration ID** (nếu dùng Facebook Login thường thì bỏ qua, hệ thống xin quyền bằng `scope`).
  2. Trang **Page thử**: bạn là quản trị (Admin) Page, và là Admin/Developer/Tester của App.
- **Đặt vào đâu:** dev → `.env.local`; staging → file `.env.cf-staging` trên máy ảo (do chủ dự án; khóa `TOKEN_ENC_KEYS` riêng, mục 1.3). Biến (đã có tên trong `env.example`): `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URL`, `TOKEN_ENC_KEYS`; mới: `FB_OAUTH_ENABLED=true`, tùy chọn `FB_LOGIN_CONFIG_ID` (Configuration ID ở trên), `CHANNELS_LIMIT_DEFAULT` (số kênh tối đa mỗi workspace, mặc định 1 vì chưa có bảng gói cước).
- **Lệnh kiểm sau khi đặt:** khởi động lại `pnpm --filter @flow/web dev` — web phải lên bình thường (thiếu biến hoặc `TOKEN_ENC_KEYS` thiếu khóa cho phiên bản đang dùng → web dừng và nêu **tên** biến/phiên bản). Mở `http://localhost:3000/api/channels/facebook/start` khi đã đăng nhập bằng Owner → chuyển sang Facebook. Sau khi kết nối: `curl http://localhost:3000/api/health` vẫn `ok`.
- **Cờ cần bật:** `FB_OAUTH_ENABLED=true` (mặc định TẮT: tắt thì `/api/channels/facebook/*` trả 404 và UI ẩn nút).
- **Mở khóa:** kết nối Page thật, nhận bình luận thật (`WH-INGEST`), gửi trả lời/ẩn thật (`FB-REPLY`, `FB-HIDE`), nút Kết nối lại.
- **Mã KT:** `docs/testing/KIEM_TRA_TAY.md` KT-014. Lưu ý: `META_OAUTH_REDIRECT_URL` phải khớp từng ký tự với Valid OAuth Redirect URIs; chế độ Development cho phép `http://localhost`.

## 2. Thử webhook thật bằng Cloudflare quick tunnel

Webhook của Meta phải gọi được tới máy bạn qua HTTPS công khai. Dùng **quick tunnel** của Cloudflare (không cần tài khoản, không cần tên miền; địa chỉ đổi mỗi lần chạy).

1. Cài `cloudflared` (một lần): `winget install --id Cloudflare.cloudflared`.
2. Chạy web: `pnpm --filter @flow/web dev` (cổng 3000).
3. Ở cửa sổ khác: `cloudflared tunnel --url http://localhost:3000` → in ra địa chỉ dạng `https://<ngẫu-nhiên>.trycloudflare.com`.
4. Ở Meta App → Webhooks → Page → **Edit subscription**:
   - **Callback URL:** `https://<ngẫu-nhiên>.trycloudflare.com/api/webhooks/meta`
   - **Verify token:** đúng giá trị `META_WEBHOOK_VERIFY_TOKEN` trong `.env.local` của bạn.
   Meta gửi `GET` kèm `hub.verify_token`/`hub.challenge`; code so khớp verify token rồi trả `hub.challenge`.
5. Sau đó mọi `POST` từ Meta mang `X-Hub-Signature-256` (HMAC-SHA256 của thân thô bằng `META_APP_SECRET`); code **xác minh chữ ký bằng so sánh thời gian hằng trước khi xử lý** như production — sai chữ ký trả 401, không xử lý.
6. Bình luận mới trên bài của Page thử → webhook → job `ingest` → hiện ở trang Bình luận.

Lưu ý an toàn:
- Địa chỉ quick tunnel **mở web dev của bạn ra internet** khi còn chạy. Chỉ bật khi cần thử; tắt (`Ctrl+C`) khi xong. Đừng đăng nhập tài khoản thật có dữ liệu khách trên bản dev đó.
- Địa chỉ đổi mỗi lần chạy → phải cập nhật lại Callback URL ở Meta mỗi lần (OAuth vẫn dùng `localhost`, không đổi).
- Không commit địa chỉ tunnel. Không đặt tunnel vào `BETTER_AUTH_URL` (đăng nhập vẫn chạy ở `http://localhost:3000`).
- `CLIENT_IP_SOURCE` giữ `none` ở dev (không tin header IP của tunnel).

## 2d. Quét bù bình luận (`POLLING-BACKFILL`, `FB-BACKFILL`, `FB-FETCH-PAGE-WIDE`)

Code đã xong-mock (connector giả/fixture). Để bật đường thật trên staging bạn cần:
1. Page thử có vài bài viết + bình luận, đã kết nối qua mục 1 (kênh `connected`, `webhook_subscribed`).
2. Đặt `POLLING_ENABLED=true` cho **worker** (cần `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENC_KEYS`). Mặc định TẮT.
3. Chờ `POLLING-CHANNEL-LIST` (migration của làn b: hàm liệt kê kênh xuyên workspace) — chưa có thì worker chỉ báo lỗi cấu hình và không quét.
4. Kiểm trên Page thật giả định: `updated_time` của bài tăng khi có bình luận mới (nếu không, đổi cách chọn bài — QP1).
Không cần khóa mới nào ngoài mục 1. Kiểm tay: KT-021.

## 2c. Bật connector Facebook ở worker — `FB-CONNECTOR-REGISTER` (Xong-mock)

Code đã nối `createFacebookConnector` vào worker nhưng cờ **tắt mặc định**. Bạn cần cung cấp (chỉ khi muốn thử với Page thật; dùng Page thử, không dùng Page khách):
- Một Page thử đã kết nối qua `FB-OAUTH` (mục 1) — token Page nằm mã hóa trong DB.
- Trên **máy chạy worker** đặt biến: `FB_CONNECTOR_ENABLED=true`, `META_APP_ID`, `META_APP_SECRET` (cùng Meta App ở mục 1), `TOKEN_ENC_KEYS` (cùng khóa với web). Không commit giá trị; chỉ tên biến có trong `env.example`.
- Điều kiện trước khi bật ở môi trường thật: `SEND-SWEEP`/`HIDE-SWEEP` đã merge (tránh yêu cầu kẹt `sending`). Kiểm tay: KT-016/KT-012.

## 2b. Tên sản phẩm, logo, tên miền, email gửi — `CFG-APPNAME` (FR-125, mã KT-018)

Code đã đọc cấu hình, đang chạy bằng **giá trị tạm** (`CommentFlow AI`, không logo/tên miền). Khi chốt tên (Q6), chỉ cần đặt biến, **không sửa code**:

| Biến | Ý nghĩa | Ghi chú |
|---|---|---|
| `APP_NAME` | Tên hiển thị (giao diện, tiêu đề trang, thư, tên trong app 2FA) | tối đa 60 ký tự |
| `APP_LOGO_URL` | Logo: đường dẫn gốc (`/brand/logo.svg`, file đặt ở `apps/web/public/brand/`) hoặc URL `https://…` | bỏ trống = biểu tượng mặc định |
| `APP_DOMAIN` | Tên miền công khai, ví dụ `app.ten-moi.vn` | chỉ tên miền, không `https://` |
| `APP_EMAIL_FROM` | Người gửi thư đầy đủ `Tên <no-reply@ten-moi.vn>` | bỏ trống = dựng từ `APP_NAME` + `APP_DOMAIN`; `SMTP_FROM` (nếu có) vẫn được ưu tiên |

Tên miền còn phải được xác minh (SPF/DKIM) ở nhà cung cấp email trước khi gửi thật.

## 3. Các mục khác (thêm khi tới lượt)
- Nhà cung cấp email production, tên sản phẩm/tên miền (Q6), khóa nhà cung cấp LLM trả phí, bộ ~300 bình luận thật, Shopify dev store, Google Cloud, quyền TikTok: xem `docs/plans/MASTER.md` (cột "Ngoài").
