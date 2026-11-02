# Quy trình kiểm thử trên máy chạy thật (staging)

Chỉ chạy trên **máy chạy thật**. Đầu vào: tên nhánh (hoặc "staging" = nhánh đang deploy). Máy này **không viết tính năng**; nó kiểm, ghi kết quả và tạo việc cho máy code.

1. `git fetch` → `git checkout <nhánh>` → `git pull`. Không sửa file nào trong `apps/`, `packages/`, `services/`.
2. Đọc `docs/plans/<nhánh>.md` mục "Cách kiểm tra" và `docs/handoff/<nhánh>.md` (nếu có). Không đọc source trừ khi cần để hiểu một lỗi cụ thể.
3. Kiểm deploy: GitHub Actions job deploy của commit này xanh; `docker compose ps` mọi dịch vụ `healthy`. Đỏ → ghi lỗi (bước 7), dừng.
4. Chạy E2E/contract test của phạm vi nhánh trên staging (lệnh trong `AGENTS.md` mục Lệnh); chỉ in lỗi.
5. Bước cần người (ví dụ: bình luận lên Page thử, chạy quảng cáo thử): in danh sách thao tác ngắn cho chủ dự án, chờ xác nhận "đã làm", rồi đọc kết quả qua log (`docker compose logs <dịch vụ> --since 10m`, chỉ dòng lỗi/cảnh báo) và Langfuse trace.
6. Không kiểm chứng code (việc đó máy chính đã làm bằng `verifier-*` trong `/finish`). Chỉ kiểm hành vi chạy thật.
7. Ghi kết quả vào `docs/staging/<nhánh>.md` theo mẫu `docs/staging/TEMPLATE.md`. Mỗi lỗi → một GitHub Issue (`gh issue create --label staging-bug --title "<nhánh>: <lỗi>"`), nội dung: bước tái hiện, kỳ vọng, thực tế, log đã che PII (không dán token, SĐT, email).
8. Commit chỉ file `docs/staging/<nhánh>.md` (`docs(staging): verify <nhánh>`), push. Báo cáo ≤ 6 dòng: Đạt/Không đạt, số issue, bước nào cần chủ dự án.

Sửa hạ tầng (Compose, Caddy/Tunnel, script deploy, runner) → nhánh riêng `ops/<việc>` trên máy chạy thật, theo `feature.md`/`finish.md` như việc thường.
