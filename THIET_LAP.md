# Thiết lập môi trường CommentFlow — từng bước

> Làm theo thứ tự A → H, mỗi bước có **Kiểm tra** để biết đã đúng trước khi sang bước sau. Thời gian dự kiến: A–F khoảng 60–90 phút; G là công việc Giai đoạn 0 (1–2 buổi).
>
> Lệnh cài đặt lấy từ tài liệu chính thức tại thời điểm viết (02/11/2026); nếu một lệnh báo lỗi, xem link nguồn cuối file.

---

## A. Chuẩn bị máy

### A1. Hệ điều hành
- macOS 13+, Ubuntu 20.04+/Debian 10+, hoặc Windows 10/11.
- **Windows: dùng WSL2 (Ubuntu)** cho cả dự án. Lý do: Codex CLI chưa hỗ trợ Windows gốc chính thức; Claude Code chỉ có sandbox trên WSL2. Mở PowerShell (Admin) → `wsl --install` → khởi động lại → mở "Ubuntu". Từ đây mọi lệnh chạy **trong WSL**, repo đặt trong `~/` của WSL (không đặt ở `/mnt/c/...` vì chậm).

### A2. Git, Node.js
```bash
git --version          # cần có
node --version         # cần v22 trở lên (Codex CLI yêu cầu Node 22+)
```
Chưa có Node 22: cài qua nvm
```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
# mở terminal mới
nvm install 22 && nvm use 22
```
> Nếu dự án của bạn đang ghim phiên bản Node khác (file `.nvmrc` / `engines` trong package.json), giữ phiên bản dự án cho repo và chỉ dùng Node 22 khi cài Codex — báo tôi nếu xung đột.

**Docker Desktop** (bắt buộc — khung chạy đủ 7 dịch vụ): cài Docker Desktop cho Windows, bật WSL2, trong Settings → Resources cấp **ít nhất 12 GB RAM** (Langfuse + ClickHouse khá nặng; máy dưới 16 GB RAM sẽ chậm).

**Kiểm tra:** `git --version`, `node --version` (≥ 22) và `docker compose version` đều in ra phiên bản.

### A3. Claude Code
```bash
curl -fsSL https://claude.ai/install.sh | bash      # macOS / Linux / WSL
# mở terminal mới
claude --version
claude doctor
```
Đăng nhập: chạy `claude` ở bất kỳ thư mục nào, làm theo trình duyệt (cần gói Pro, Max, Team, Enterprise hoặc tài khoản Console). Gõ `/exit` để thoát.

**Kiểm tra:** `claude --version` in số phiên bản; `claude doctor` không báo lỗi cài đặt.

### A4. Codex CLI (dùng khi thiếu token Claude — cài sẵn để chuyển nhanh)
```bash
npm install -g @openai/codex
codex --version
codex                    # đăng nhập bằng tài khoản ChatGPT qua trình duyệt
# trình duyệt lỗi:  codex login --device-auth
codex login status
```
Tạo/sửa `~/.codex/config.toml`:
```toml
approval_policy = "on-request"     # tự chạy lệnh trong sandbox, hỏi khi cần vượt sandbox
sandbox_mode    = "workspace-write" # chỉ ghi trong thư mục repo, không mạng
```
- **Không** đặt `danger-full-access` hay `approval_policy = "never"`.
- Không cần khai báo `model` — để Codex dùng mặc định; đổi sau nếu cần.
- Không cần MCP Stitch cho Codex (chỉ Claude chạy `/stitch-sync`).

**Kiểm tra:** `codex login status` báo đã đăng nhập.

---

## B. Chuẩn bị repo

### B1. Khởi tạo repo (thư mục trống) hoặc tạo nhánh (đã có repo)

**Thư mục trống, chưa có Git** (trường hợp hiện tại):
```powershell
cd C:\Users\Admin\Documents\CommentFlow
git init
git branch -M main
git config --global user.name "Tên của bạn"
git config --global user.email "<email>"
```
Rồi làm B2, B3, commit `chore: project docs + Claude Code starter` trên `main` (chưa có code nên không cần nhánh riêng cho lần đầu).

**Đã có repo:**
```bash
cd <thư-mục-repo-CommentFlow>
git status                 # phải sạch; còn thay đổi dở thì commit/stash trước
git checkout -b chore/claude-setup
```

### B2. Chép bộ khởi động
Giải nén `CommentFlow_ClaudeCode_Starter.zip`, rồi chép vào **gốc repo**:
```bash
STARTER=<đường-dẫn>/commentflow-starter
cp    $STARTER/AGENTS.md                      .
cp -n $STARTER/CLAUDE.md                      .   # -n: không ghi đè nếu repo đã có
mkdir -p .claude docs design
cp -rn $STARTER/.claude/.                     .claude/
cp -rn $STARTER/docs/.                        docs/
cp -rn $STARTER/design/.                      design/
cp    $STARTER/THIET_LAP.md $STARTER/HUONG_DAN_CLAUDE_CODE.md docs/
```
- **Repo đã có `CLAUDE.md`:** mở file cũ, chuyển phần còn giá trị (lệnh chạy, quy ước code) vào `AGENTS.md`; thay nội dung `CLAUDE.md` bằng bản trong bộ khởi động (dòng đầu là `@AGENTS.md`).
- **Repo đã có `.claude/settings.json`:** gộp tay — giữ quyền cũ, thêm khối `deny`, `model`, `effortLevel` từ bản mới.
- **Repo đã có `docs/` khác:** `cp -n` không ghi đè; kiểm `git status` để thấy file nào được thêm.

### B3. Bí mật
```bash
grep -n "^\.env" .gitignore || printf "\n.env\n.env.*\n!.env.example\n" >> .gitignore
git ls-files | grep -E "(^|/)\.env" && echo "CẢNH BÁO: .env đang bị commit"
```
- Có cảnh báo → `git rm --cached <file>` và **đổi ngay** các khóa trong file đó.
- `.env` trên máy dev chỉ chứa khóa thử nghiệm (Meta App dev, Shopify dev store, LLM key ngân sách thấp). Không để token production.

**Kiểm tra:** `git status` thấy `AGENTS.md`, `CLAUDE.md`, `.claude/`, `docs/…`, `design/…` mới; không thấy `.env`.

---

## C. Rule ECC (chỉ chép, không cài plugin)

```bash
git clone --depth 1 https://github.com/affaan-m/ECC /tmp/ecc
ls /tmp/ecc/rules/common /tmp/ecc/rules/typescript    # xem có những file gì
less /tmp/ecc/rules/common/*.md                       # đọc lướt trước khi chép
mkdir -p .claude/rules/ecc
cp -r /tmp/ecc/rules/common /tmp/ecc/rules/typescript .claude/rules/ecc/
rm -rf /tmp/ecc
```
- Chỉ lấy từ `github.com/affaan-m/ECC` (repo chính thức; README cảnh báo có bản sao giả mạo).
- **Không** chạy `install.sh`, không `/plugin install`, không cài hook.
- Rule nào mâu thuẫn với `AGENTS.md` (ví dụ quy trình review khác) → xóa file rule đó; `AGENTS.md` là chuẩn.

**Kiểm tra:** `ls .claude/rules/ecc` thấy `common/` và `typescript/`.

---

## D. Kiểm tra Claude Code trong repo

```bash
claude
```
Trong phiên, gõ lần lượt:

| Lệnh | Phải thấy | Nếu không |
|---|---|---|
| `/model` | `sonnet` | Kiểm `.claude/settings.json` có `"model": "sonnet"` (gói Pro: Sonnet mặc định; chỉ gõ `/model opusplan` cho việc lập kế hoạch khó, đầu phiên) |
| `/agents` | gap-analyzer, verifier-security, verifier-db, test-runner | File phải nằm ở `.claude/agents/*.md`, có phần `---` đầu file |
| `/permissions` | Luật chặn `Read(./.env)` … | Kiểm JSON hợp lệ: `claude doctor` báo lỗi settings |
| `/mcp` | Server Stitch trạng thái connected | Xem mục D1 |
| `/feature` (gõ `/` rồi tìm) | Có các lệnh feature, finish, stitch-sync, codemap-init | File ở `.claude/commands/*.md` |

Thử chặn bí mật: gõ *"Đọc file .env"* → Claude phải từ chối/bị chặn.

### D1. MCP Stitch không hiện trong repo này
- Bạn đã cài MCP ở phạm vi người dùng (user) thì repo nào cũng thấy; nếu cài ở phạm vi một dự án khác thì repo này không thấy.
- Kiểm: `claude mcp list` (ngoài phiên). Không có Stitch → thêm lại theo cách bạn đã cài trước đây, chọn phạm vi user. Không chép khóa/token của MCP vào repo.

Gõ `/exit`. Commit:
```bash
git add AGENTS.md CLAUDE.md .claude docs design .gitignore
git commit -m "chore: add Claude Code + Codex starter (AGENTS.md, workflows, agents)"
```

---

## E. Kiểm tra Codex trong repo

```bash
codex
```
Gõ: *"Không sửa file. Liệt kê 5 điều trong mục Cấm và quy tắc 'Một nhánh, một agent' trong AGENTS.md."*

**Kiểm tra:** Codex trả lời đúng nội dung `AGENTS.md` → Codex đã đọc file hướng dẫn chung. Thử *"đọc .env"* → nếu Codex đọc được, đó là lý do quy tắc B3 (không để token thật trên máy) là bắt buộc. Thoát Codex.

---

## F. Thói quen an toàn trước khi code

- Mỗi việc một nhánh `feat/<mã>`; không làm trực tiếp trên `main`.
- Một nhánh chỉ một agent tại một thời điểm; đổi agent sau `/finish` (commit + handoff).
- Migration chỉ chạy local/staging; production chạy qua CI có duyệt tay (thiết lập ở GĐ0, bước G6).
- Cuối mỗi ngày: `git push` nhánh để không mất việc nếu máy hỏng.

---

## G. Giai đoạn 0 — dựng khung từ thư mục trống

> Dự án **làm mới từ đầu** (không có source sẵn) → bỏ `/codemap-init` lúc đầu và bỏ agent `gap-analyzer`; bản đồ source lập **sau** khi dựng khung.

| # | Ở đâu | Gõ / làm | Kết quả → việc của bạn |
|---|---|---|---|
| G1 | Claude | `/stitch-sync` | `design/stitch/*.html` + `*.png`, `manifest.json`, bảng màn hình → chốt màu → commit `chore(design): sync Stitch screens` → `/clear` |
| G2 | Claude, **plan mode** (`Shift+Tab` đến khi thấy plan mode) | Dán prompt **G2** bên dưới | `docs/plans/chore-scaffold.md` + `docs/decisions/001-stack.md` → bạn đọc, hỏi lại chỗ chưa rõ, **duyệt** |
| G3 | Claude, thoát plan mode, `Shift+Tab` sang tự chấp nhận sửa file | *"Duyệt. Dựng khung theo docs/plans/chore-scaffold.md, từng bước, chạy kiểm tra sau mỗi bước."* | Monorepo, Next.js chạy được, Postgres Docker, migration đầu, RLS + `withWorkspace`, test RLS, CI → `/finish` → commit |
| G4 | Claude | `/codemap-init` | Bản đồ của khung vừa dựng (ngắn) + mục **Lệnh** trong `AGENTS.md` → kiểm → commit → `/clear` |
| G5 | Claude | *"Lập docs/gap-matrix.md thành danh sách việc theo docs/16_Development_Roadmap.md §3 (GĐ0–GĐ3), mỗi dòng một mã FR/US, trạng thái Thiếu, ước lượng S/M/L. Không đọc code."* | Danh sách việc có thứ tự → bạn cắt bớt nếu quá nhiều → commit |
| G6 | Claude | Mỗi việc: `git checkout -b feat/<mã>` → `/feature <mã>` → duyệt → code → `/finish` | Theo thứ tự trong gap matrix (đăng ký/workspace → thành viên → `ai_usage` → feature flag → …) |
| G7 | Bạn (song song) | — | Tạo **Meta App dev** + **Page thử nghiệm**; gom ~300 bình luận thật đã xóa thông tin cá nhân (4 nhóm ngôn ngữ, mỗi nhóm ≥ 30; ghi kèm hành động đúng: trả lời / hỏi lại / chuyển hướng / chuyển người) cho GĐ2 |

**Prompt G2** (dán nguyên văn):
```
Repo đang trống, chỉ có docs/ và design/. Lập kế hoạch dựng khung CommentFlow theo docs/decisions/000-chot-02-11.md, docs/09_System_Architecture.md §2 (ghi chú "Chốt 02/11"), §3, §3.1, §10 và docs/16_Development_Roadmap.md §3 GĐ0 + §3.1.
Chỉ đọc: decisions/000, 09 §2–3.1 và §10, 10 §1, §3.1, §3.8 và §4, 13 §4, 15 §4, 16 §3–3.1, 08 §8. Không đọc file khác trong docs/.
Phạm vi khung: apps/web (Next.js, TypeScript, next-intl vi/en), apps/worker (pg-boss), services/ml (FastAPI, chỉ endpoint /health), packages/db (migration + RLS + withWorkspace, Postgres có pgvector), packages/saas-core (auth, tenancy, flags), packages/ai (chỉ lớp bọc gọi LLM qua LiteLLM + ghi ai_usage, chưa có pipeline), packages/shared; Docker Compose local chạy đủ 7 dịch vụ (web, worker, ml, Postgres+pgvector, Redis, LiteLLM, Langfuse tự host kèm ClickHouse + MinIO) có health check; CI GitHub Actions (lint, typecheck, test, dependency-cruiser, gitleaks).
Đề xuất và nêu lý do + giấy phép cho: trình quản lý gói/monorepo, ORM/migration, thư viện auth, test runner, lint/format. Ưu tiên ít phụ thuộc, phổ biến, chạy tốt trên Windows (Docker Desktop + WSL2). Ghi rõ RAM dự kiến của cả bộ Compose.
Viết kế hoạch bằng tiếng Việt dễ hiểu theo mục "Cách trình bày cho chủ dự án" trong AGENTS.md.
Ghi vào docs/plans/chore-scaffold.md (các bước nhỏ, mỗi bước có cách kiểm tra) và docs/decisions/001-stack.md. Chưa tạo code. Liệt kê câu hỏi cần tôi chốt.
```

Hết token Claude giữa chừng → chuyển sang Codex theo `docs/HUONG_DAN_CLAUDE_CODE.md` §7.3.

---

## H. Danh sách kiểm tra cuối

- [ ] `claude --version`, `claude doctor` OK; đã đăng nhập
- [ ] `codex login status` OK; `~/.codex/config.toml` có `on-request` + `workspace-write`
- [ ] `.gitignore` có `.env*`; không có `.env` nào bị commit; `.env` máy dev chỉ có khóa thử nghiệm
- [ ] `AGENTS.md` + `CLAUDE.md` (dòng đầu `@AGENTS.md`) ở gốc repo
- [ ] `/model` = sonnet · `/agents` thấy 4 agent · `/permissions` có luật chặn · `/mcp` thấy Stitch
- [ ] `.claude/rules/ecc/common` + `typescript` có mặt; không cài plugin/hook ECC
- [ ] Codex trả lời đúng nội dung AGENTS.md
- [ ] Commit `chore: add Claude Code + Codex starter` trên nhánh `chore/claude-setup`

## Nguồn

- Claude Code — cài đặt, yêu cầu hệ thống: https://code.claude.com/docs/en/setup
- Claude Code — subagent, model: https://code.claude.com/docs/en/sub-agents · https://code.claude.com/docs/en/model-config
- Codex CLI — cài đặt, cấu hình (bài hướng dẫn tổng hợp; đối chiếu tài liệu OpenAI chính thức nếu lệnh khác): https://dev.to/owen_fox/how-to-install-codex-cli-the-complete-official-setup-guide-32le
- ECC: https://github.com/affaan-m/ECC

## Việc làm song song ngay từ đầu (ngoài code)

- **Meta Business Verification** cho Business Manager sở hữu Meta App (đang ở chế độ dev) — mất vài ngày đến vài tuần; cần tên sản phẩm, tên miền, trang chính sách (Q6).
- **TikTok:** tạo tài khoản TikTok Business + đăng ký TikTok for Developers, xin quyền API bình luận (Q5). Chưa có thì GĐ5 chờ, các giai đoạn khác không ảnh hưởng.
- **Google Cloud:** tạo project, bật Sheets API, màn hình OAuth (chỉ quyền đọc) cho FR-121.
- **Codex** (ChatGPT Plus/Pro): cài sẵn, dùng khi hết lượt Claude — xem `HUONG_DAN_CLAUDE_CODE.md` §7. Không đưa dữ liệu khách thật vào phiên Codex.
