# Giữ máy ảo (cf-dev) không tụt lại so với `main`

Máy ảo chạy project `cf-dev` bằng `infra/docker-compose.yml` + `infra/docker-compose.dev.yml` lấy từ **checkout riêng** ở `~/CommentFlow`. Checkout đó **không tự cập nhật**: merge PR vào `main` không đổi gì trên máy ảo. Ngày 07/11/2026 máy ảo còn ở PR #125 trong khi `main` đã tới #239 (cấu hình LiteLLM, dịch vụ `ml`, biến môi trường mới đều chưa có trên máy ảo).

## Quy tắc

**Mỗi lần merge một PR có đổi `infra/` (compose, `infra/litellm/`, `infra/postgres/`, `infra/scripts/`, Dockerfile của dịch vụ như `services/ml/`), người merge phải chạy ngay:**

```
pnpm cf:dev sync main
```

rồi làm bước "Dựng lại dịch vụ lệch" dưới đây nếu PR có đổi cấu hình dịch vụ. PR không đổi `infra/` thì không bắt buộc, nhưng nên sync khi bắt đầu một phiên làm việc có dùng máy ảo.

`pnpm cf:dev sync` chỉ cập nhật mã (git fetch + checkout + pull `--ff-only`); nó **không** dựng lại container. Mã ở máy ảo mới nhưng container còn chạy cấu hình cũ cho tới khi dựng lại.

## Kiểm container nào chạy cấu hình cũ (chỉ đọc)

Docker gắn lên mỗi container nhãn `com.docker.compose.config-hash` (băm cấu hình lúc tạo). So với băm cấu hình mong đợi của compose hiện tại: dịch vụ nào **lệch** là đang chạy cấu hình cũ.

```
ssh cf 'cd ~/CommentFlow && C="docker compose -p cf-dev --env-file .env.cf-dev -f infra/docker-compose.yml -f infra/docker-compose.dev.yml"; echo "== mong đợi =="; $C config --hash "*" | sort; echo "== đang chạy =="; docker ps -a --filter label=com.docker.compose.project=cf-dev --format "{{.Label \"com.docker.compose.service\"}} {{.Label \"com.docker.compose.config-hash\"}}" | sort'
```

- **Không dùng** `docker compose config` đầy đủ để so sánh: nó thay biến môi trường bằng giá trị thật, in ra mật khẩu và khóa. Chỉ dùng `--hash`, hoặc so **tên** biến (không in giá trị).
- Muốn biết lệch vì đâu: `git diff <commit cũ> main -- infra/docker-compose.yml infra/docker-compose.dev.yml`, và so tên biến môi trường của container với compose (không in giá trị).

## Dựng lại dịch vụ lệch (không `down`, không xóa volume)

Chỉ dựng lại **dịch vụ thật sự cần**, mỗi dịch vụ một lệnh:

```
pnpm cf:dev up -d --no-deps <dịch vụ>
```

- **Luôn thêm `--no-deps`.** Mặc định `up -d <dịch vụ>` cũng tạo lại các dịch vụ mà nó phụ thuộc nếu cấu hình của chúng lệch (ví dụ `litellm` phụ thuộc `postgres`), tức khởi động lại cả cơ sở dữ liệu.
- Dịch vụ có `build:` (như `ml`) thêm `--build`: `pnpm cf:dev up -d --build ml`.
- **Không** dùng `down`, `-v`, `--volumes`, `--force-recreate` cho cả project. Wrapper `pnpm cf:dev` cũng chặn các cờ xóa volume.
- **Không cần dựng lại** khi băm lệch chỉ vì biến môi trường mà dịch vụ chỉ đọc lúc khởi tạo lần đầu. Ví dụ `postgres`: các biến `CF_AUTH_PASSWORD`, `CF_WORKER_PASSWORD`, `LANGFUSE_DB_PASSWORD` chỉ được script khởi tạo đọc khi volume còn trống; các role đã tạo bằng `pnpm cf:dev add-auth-role`/`add-worker-role`. Dựng lại chỉ khởi động lại DB mà không đổi gì. Ghi nhận trong báo cáo thay vì dựng lại.

Sau khi dựng lại, kiểm: `pnpm cf:dev ps` (dịch vụ `healthy`) và băm khớp lại bằng lệnh kiểm ở trên.

## Khi đổi biến môi trường của máy ảo

Compose chỉ đọc `.env.cf-dev` lúc `up`. Sửa file đó (ví dụ bật `ML_EMBED_ENABLED`) xong phải dựng lại dịch vụ dùng biến đó thì mới có hiệu lực. File này không bao giờ commit và agent không đọc nó.
