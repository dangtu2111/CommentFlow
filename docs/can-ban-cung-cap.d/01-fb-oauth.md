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
