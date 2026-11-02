# 002 — Máy code không cài Docker; mọi container chạy trên máy phụ (02/11/2026)

Trạng thái: **Đã chốt** (bổ sung cho 000, không thay mục nào).

| Máy | Chạy gì |
|---|---|
| **Máy code** (máy chính, tài khoản Claude 1) | Node 22, Next.js dev server, worker, unit test, lint, typecheck, Claude Code (Sonnet / opusplan), Codex dự phòng. **Không cài Docker.** |
| **Máy phụ** (Windows 10 IoT LTSC, 64 GB; máy ảo Ubuntu 24.04 trong Hyper-V, 40 GB; tài khoản Claude 2) | Compose `cf-dev`: Postgres+pgvector (DB `cf_dev`, `cf_test`), Redis, `ml`, LiteLLM, Langfuse — cho máy code dùng qua LAN. Compose `cf-staging`: đủ 7 dịch vụ, deploy bằng GitHub self-hosted runner, ra internet qua Cloudflare Tunnel. Claude Code: Sonnet cho `/staging-verify`, Haiku cho `/mech`. |

Quy tắc:
- `.env` máy code trỏ `DATABASE_URL`, `TEST_DATABASE_URL`, `REDIS_URL`, `ML_URL`, `LITELLM_BASE_URL`, `LANGFUSE_HOST` tới IP LAN cố định của máy ảo; chỉ khóa dev.
- Cổng của `cf-dev` chỉ mở cho IP máy code (`ufw`); `cf-staging` không publish Postgres/Redis.
- Langfuse 2 project (dev, staging); LiteLLM 2 virtual key có ngân sách riêng; Redis dev dùng prefix khóa `dev:`.
- Integration test chạy với `cf_test` (tạo lại schema mỗi lần), không dùng Testcontainers trên máy code; CI dùng service container.
- Máy phụ tắt → máy code vẫn chạy được unit test, lint, typecheck; việc cần DB thì chờ.
- Code không được giả định Docker có trên máy chạy lệnh dev (script dev gọi Node trực tiếp).
- Dự phòng: máy ảo của máy phụ sao lưu bằng Hyper-V Export định kỳ (kèm dump Postgres `cf-staging`); máy phụ hỏng → Import máy ảo vào máy khác có Hyper-V (Windows Pro/Enterprise, đủ RAM) để chạy tạm.

## Thông số mạng đã cài (02/11/2026)

| Thành phần | Giá trị |
|---|---|
| Router | `192.168.1.1`; DHCP Static IP cho 2 máy |
| Máy code | Wi-Fi TP-Link USB, `192.168.1.96` |
| Máy phụ (Windows) | Wi-Fi Realtek RTL8188EU, `192.168.1.124`; Hyper-V **NATSwitch** `10.10.10.1/24` (NAT `CFNat`) vì chưa cắm dây mạng |
| Máy ảo Ubuntu 24.04 | `10.10.10.10/24`, gateway `10.10.10.1`, DNS 1.1.1.1/8.8.8.8 (`/etc/netplan/99-cf.yaml`); 8 vCPU, 40 GB RAM, tự khởi động |
| SSH từ máy code | `ssh cf` → `192.168.1.124:2222` → portproxy → `10.10.10.10:22`; tường lửa Windows chỉ cho `192.168.1.96` |
| Dịch vụ `cf-dev` cho máy code | Sau G3: mỗi cổng cần dùng thêm 1 dòng `netsh interface portproxy` + 1 luật tường lửa chỉ cho `192.168.1.96` |
| Khi cắm được dây mạng | Đổi máy ảo sang switch External, bỏ portproxy |

