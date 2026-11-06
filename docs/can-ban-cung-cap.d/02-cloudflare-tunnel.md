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
