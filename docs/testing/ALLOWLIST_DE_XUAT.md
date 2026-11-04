# Đề xuất danh sách allow cho `.claude/settings.json` (CHƯA ÁP DỤNG)

> Mục đích: bớt hỏi quyền cho lệnh lặp lại hằng ngày. **Chủ dự án duyệt trước khi áp.** File này không đổi `.claude/settings.json`. **Khối `deny` giữ nguyên** (đọc `.env*`, `*.pem`, `*.key`, `node_modules`, `printenv`, `git push --force*`).
> Hiện `ask` đang có `Bash(git push*)` và `Bash(docker*)`. Trong Claude Code, `deny` thắng `ask`, `ask` thắng `allow`: nên mẫu `allow` hẹp hơn dưới đây **chỉ có tác dụng nếu bạn bỏ mục `ask` tương ứng** (xem "Cách áp").

## JSON mẫu (chỉ phần `allow`)

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm install --frozen-lockfile)",
      "Bash(pnpm lint)",
      "Bash(pnpm lint:i18n)",
      "Bash(pnpm typecheck)",
      "Bash(pnpm test)",
      "Bash(pnpm test:*)",
      "Bash(pnpm depcruise)",
      "Bash(pnpm check:*)",
      "Bash(pnpm db:check-rls)",
      "Bash(pnpm exec biome check:*)",
      "Bash(pnpm --filter * exec vitest run:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git pull:*)",
      "Bash(git push origin feat/*)",
      "Bash(git push origin fix/*)",
      "Bash(git push origin chore/*)",
      "Bash(git push origin docs/*)",
      "Bash(gh pr create:*)",
      "Bash(gh pr checks:*)",
      "Bash(gh pr merge:*)",
      "Bash(gh pr view:*)",
      "Bash(ssh cf \"cd ~/CommentFlow && git pull\")",
      "Bash(docker compose -p cf-dev:*)"
    ]
  }
}
```

## Giải thích từng dòng

| Dòng | Vì sao | Rủi ro / giới hạn |
|---|---|---|
| `pnpm install --frozen-lockfile` | Cài đúng lockfile (quy định ở `AGENTS.md`) | Chạy script cài đặt của gói phụ thuộc; lockfile đã được review. Không allow `pnpm add` (đổi lockfile cần nêu lý do + giấy phép) |
| `pnpm lint`, `lint:i18n`, `typecheck`, `depcruise` | Kiểm máy móc, chỉ đọc | Không có |
| `pnpm test`, `pnpm test:*` | Gồm `test:coverage`, `test:trace`, `test:db` | `test:db` chạy trên DB `cf_test` ở máy ảo (tạo lại schema `cf_test`); chỉ trỏ DB test theo cấu hình (`migration-guard` chặn nhầm môi trường) — vẫn nên để một mình `pnpm test:db` trong `ask` nếu muốn thận trọng |
| `pnpm check:*` | `check:plans`, `check:migrations` | Chỉ đọc |
| `pnpm db:check-rls` | Kiểm RLS trên DB dev/test/ci | Chỉ đọc; **không** allow `pnpm db:migrate` (ghi DB) — để hỏi |
| `pnpm exec biome check:*` | `biome check --write <thư mục>` trước commit | `--write` sửa file trong repo (nằm trong git, hoàn tác được) |
| `pnpm --filter * exec vitest run:*` | Test một file/một gói (`AGENTS.md`) | Chạy mã test của repo; test tích hợp cần `.env` đã có (agent không đọc file này) |
| `git status/diff/log` | Chỉ đọc | Không có |
| `git add`, `git commit` | Commit nhỏ theo mốc | Có thể `git add -A` kéo file lạ; `.gitignore` chặn `.env*`, và gitleaks quét ở CI. Cân nhắc đổi `git add:*` thành `git add -- <đường dẫn>` nếu hay lỡ tay |
| `git pull` | Đồng bộ trước khi làm (`AGENTS.md`) | Có thể gây merge xung đột; không mất commit |
| `git push origin feat/* fix/* chore/* docs/*` | Đẩy nhánh làm việc | **Không** bao gồm `main`, `mech/*`, `ops/*` (máy phụ) và cờ `--force` (deny sẵn). Lưu ý: mẫu `feat/*` khớp theo chuỗi, nên `git push origin feat/x --force` có thể khớp tiền tố — `deny` `git push --force*` chỉ bắt khi `--force` đứng ngay sau `push`; đề xuất **thêm** `Bash(git push*--force*)` và `Bash(git push*-f *)` vào `deny` (chủ dự án quyết định; đây là làm chặt, không nới) |
| `gh pr create/view/checks` | Mở PR, xem CI | Tạo bài công khai trên GitHub (kho riêng của bạn); không gồm `gh pr merge --admin` (xem dòng dưới) |
| `gh pr merge:*` | Merge sau khi CI xanh và bạn báo đạt (PROMPT §1.6) | **Rủi ro cao nhất trong danh sách:** cờ `--admin` bỏ qua điều kiện CI. Khuyến nghị: để `gh pr merge` ở `ask` (bạn bấm đồng ý mỗi lần) hoặc thêm `Bash(gh pr merge*--admin*)` vào `deny`; PROMPT §3 cấm merge khi CI đỏ |
| `ssh cf "cd ~/CommentFlow && git pull"` | Đồng bộ máy ảo (PROMPT §1.1, §1.6) | Khớp **đúng nguyên chuỗi** nên không chạy lệnh khác qua ssh; máy ảo là dev, không phải staging |
| `docker compose -p cf-dev:*` | Quản lý stack dev (`cf:dev`) | `-p cf-dev` giới hạn project; `docker compose -p cf-dev down -v` xóa dữ liệu dev — nên cấm bằng `deny` `Bash(docker compose -p cf-dev*down*)` hoặc chỉ cho `ps|logs|up|stats`. Không allow `docker*` chung (đang ở `ask`) |

## Cách áp (khi bạn duyệt)

1. Giữ `Bash(git push*)` trong `ask` (để mọi push khác, gồm `main`, vẫn hỏi). **Chưa kiểm** liệu mẫu `allow` cụ thể có thắng mẫu `ask` rộng hơn trên bản Claude Code đang dùng; nếu vẫn bị hỏi thì phải thu hẹp `ask` (ví dụ chỉ `Bash(git push origin main*)`) — thay đổi này nới lỏng nên cần bạn duyệt riêng.
2. Tương tự `docker*` ở `ask`: giữ, và dòng `docker compose -p cf-dev:*` cụ thể hơn sẽ được dùng. **Chưa kiểm** hành vi ưu tiên này trên bản Claude Code đang dùng — thử một lần rồi chỉnh.
3. Chạy thử với `/permissions`; áp ở `.claude/settings.local.json` trước (không commit) nếu chưa chắc.

## Không đưa vào allow (cố ý)

`git push origin main`, `git push --force*`, `pnpm db:migrate`, `pnpm cf:dev env-init`, `ssh cf "<lệnh khác>"`, `scripts print-dev-env`, mọi lệnh đọc `.env*`, lệnh chạm staging/production, `gh api`, `curl | sh`.
