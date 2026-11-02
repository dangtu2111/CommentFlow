# Triển khai CommentFlow với Claude Code — hướng dẫn

Nguyên tắc tối ưu: **đọc source ít lần nhất, không làm trùng việc, chỉ gọi AI thứ hai khi có giá trị kiểm chứng độc lập hoặc chuyên môn bổ sung.** Không tối ưu bằng cách chia việc cho nhiều agent.

## 1. Chép bộ khởi động vào repo

```
AGENTS.md                         → hướng dẫn chung cho mọi agent (Claude Code + Codex)
CLAUDE.md                         → @AGENTS.md + phần riêng Claude Code (gộp với CLAUDE.md cũ nếu có)
docs/workflows/                   → quy trình trung lập: feature, finish, verify, stitch-sync
docs/plans/                       → kế hoạch đã duyệt theo nhánh
.claude/settings.json             → chặn .env*, build, node_modules; model sonnet (gói Pro)
.claude/agents/gap-analyzer.md    → chỉ dùng ở GĐ0 / khi spec đổi lớn
.claude/agents/verifier-security.md
.claude/agents/verifier-db.md
.claude/agents/test-runner.md      → haiku, chỉ cho bộ test dài/E2E/build
.claude/commands/codemap-init.md  → /codemap-init (chạy 1 lần)
.claude/commands/feature.md       → /feature <mã>
.claude/commands/finish.md        → /finish
docs/01…16_*.md, docs/*Design_Prompt.md
docs/specs/README.md              → bản đồ việc → mục spec
docs/codemap.md, docs/gap-matrix.md, docs/handoff/TEMPLATE.md
design/brand/                     → logo SVG + ảnh xem trước
design/stitch/README.md           → bản xuất Stitch; tải bằng /stitch-sync
.claude/commands/stitch-sync.md   → /stitch-sync (gọi MCP Stitch, chạy ở bước 0)
```

Kiểm `.gitignore` có `.env*`. Mở Claude Code ở gốc repo, chạy `/agents` để thấy 3 agent, `/permissions` để thấy luật chặn.

## 2. ECC — chỉ lấy phần không tốn ngữ cảnh

- Chép tay `rules/common` + `rules/typescript` từ repo chính thức `affaan-m/ECC` vào `.claude/rules/ecc/` (đọc qua trước khi chép).
- **Không cài cả plugin ECC lúc này**: 71 agent + hàng trăm skill làm dài danh sách mà mọi phiên và mọi lần gọi subagent phải nạp, đi ngược mục tiêu. Cần skill nào (ví dụ `tdd-workflow`) thì cài riêng skill đó.
- `/feature` đã thay `/ecc:plan`; `/finish` đã thay vòng `/code-review` — không dùng song song để tránh lập kế hoạch/review hai lần.
- Không dùng `/multi-*`, `/astra-review`.

## 3. Thứ tự Giai đoạn 0 (làm mới từ đầu)

Xem chi tiết và prompt trong `THIET_LAP.md` mục G. Tóm tắt: `/stitch-sync` → plan mode lập kế hoạch dựng khung + ADR 001 → dựng khung → `/codemap-init` (bản đồ của khung) → gap matrix thành danh sách việc theo lộ trình → làm từng việc bằng `/feature` … `/finish`. Agent `gap-analyzer` chỉ dùng về sau, khi code đã nhiều và spec đổi lớn.

## 4. Vòng làm một việc

```
/clear → /feature <mã> → duyệt kế hoạch → (chế độ thường, Sonnet) code + test hẹp → /finish → commit
```

- Gói Pro: **Sonnet mặc định** cho cả kế hoạch và code. Chỉ với việc khó (kiến trúc, cổng tự gửi, RLS) mới gõ `/model opusplan` **ở đầu phiên** — không đổi model giữa phiên vì mất cache. Hết lượt → chuyển Codex (§7).
- Dở dang qua ngày: `/finish` ghi `docs/handoff/<nhánh>.md`; hôm sau `/feature <mã>` đọc handoff trước, không đọc lại source đã ghi.

## 5. Khi nào gọi AI thứ hai

| Gọi | Không gọi |
|---|---|
| `verifier-security`: diff chạm auth, token, chữ ký webhook, RLS, thanh toán, cổng tự gửi, `sendRecheck`, che PII | Viết code, sửa lỗi build, chạy test |
| `verifier-db`: có migration/SQL/RLS policy/truy vấn tìm kiếm | Thay đổi giao diện, văn bản, đổi tên |
| `gap-analyzer`: GĐ0, hoặc spec của một nhóm đổi lớn | "Kiểm tra lại cho chắc" khi công cụ đã xanh |

**Làn Haiku** (rẻ, chỉ cho việc tự đứng được và kiểm được bằng công cụ):

| Việc | Cách | Vì sao không làm ở phiên chính |
|---|---|---|
| Bộ test dài, E2E, build toàn bộ | agent `test-runner` (haiku) — chỉ trả lỗi | Log dài làm phình ngữ cảnh phiên chính |
| Việc cơ học nhiều file (tách chuỗi i18n, đổi tên theo danh sách, áp mẫu đã duyệt) | phiên mới `claude --model haiku`, giao danh sách file + mẫu; kiểm bằng typecheck/test | Không cần ngữ cảnh của phiên chính, khối lượng lớn |
| Dịch chuỗi giao diện sang tiếng Anh | phiên Haiku, bạn duyệt | |

Thứ tự lựa chọn: **công cụ/script (0 token) → phiên chính → phiên Haiku riêng → subagent Haiku → model mạnh hơn.** Không đổi `/model` qua lại trong một phiên (mất cache). Haiku sai 2 lần → phiên chính làm.

Verifier nhận **diff + mục spec**, không nhận lập luận của người viết → đánh giá độc lập. Mỗi nhánh gọi tối đa một lần cho mỗi loại, trừ khi phần sửa chạm lại đúng chỗ nhạy cảm.

## 6. Đo hiệu quả (cuối tuần, 10 phút)

Ghi vào bảng cuối `docs/gap-matrix.md`: chi phí tuần, số mục xong, số lần gọi verifier, và phiên nào phải đọc lại nhiều (dấu hiệu bản đồ/handoff thiếu → bổ sung). Mục tiêu theo dõi là **chi phí trên mỗi mục xong**, không phải số agent đã dùng.

## 7. Khi thiếu token Claude: thêm Codex code cùng

Nguyên tắc: **chuyển việc, không chia đôi việc.** Hai agent không bao giờ cùng sửa một nhánh; mọi trạng thái nằm trong repo nên agent nhận việc không phải đọc lại source hay lập lại kế hoạch.

### 7.1 Chuẩn bị (một lần)

- `AGENTS.md` là hướng dẫn chung (Codex tự đọc file này); `CLAUDE.md` chỉ có dòng `@AGENTS.md` + phần riêng của Claude Code. Sửa quy tắc chung → sửa `AGENTS.md`, không sửa hai nơi.
- Quy trình viết thành file trung lập trong `docs/workflows/` (feature, finish, verify, stitch-sync) — Claude gọi qua lệnh `/…`, Codex được bảo "làm theo `docs/workflows/…`".
- Cấu hình Codex chế độ sandbox chỉ ghi trong thư mục làm việc và hỏi trước khi chạy lệnh ngoài (xem tài liệu Codex hiện hành cho tên tùy chọn). Codex có thể không có cơ chế chặn đọc file như `permissions.deny` của Claude Code → **không để token thật trong `.env` trên máy dev** (đã là quy tắc của dự án).
- Code được gửi tới OpenAI khi dùng Codex: chấp nhận được với code; không đưa dữ liệu khách thật vào phiên Codex.

### 7.2 Chia vai khi thiếu token

| Việc | Ai làm | Lý do |
|---|---|---|
| Lập kế hoạch việc (`docs/plans/<nhánh>.md`) | Claude (Sonnet; `opusplan` cho việc khó) — nếu còn token; hết thì Codex theo `feature.md` | Kế hoạch tốt giảm làm lại |
| Viết code theo kế hoạch đã duyệt | **Codex** | Phần tốn token nhất, chuyển được trọn vẹn |
| Kiểm chứng diff nhạy cảm | Agent **không viết** đoạn đó: Codex viết → Claude `verifier-security`/`verifier-db`; Claude viết → Codex theo `verify.md` | Khác họ mô hình = kiểm chứng độc lập thật, có giá trị |
| Diff thường (UI, văn bản, đổi tên) | Không cần agent thứ hai | Công cụ (lint/test) đủ |
| `/stitch-sync`, `/codemap-init`, gap matrix | Agent nào còn token; chỉ một lần | Không lặp |

### 7.3 Chuyển từ Claude sang Codex giữa chừng

1. Trong Claude: `/finish` → commit phần đã xong, ghi `docs/handoff/<nhánh>.md` (Agent vừa làm: claude).
2. Mở Codex ở gốc repo, cùng nhánh. Gõ:
   > Đọc AGENTS.md. Tiếp tục nhánh hiện tại: đọc `docs/plans/<nhánh>.md` và `docs/handoff/<nhánh>.md`, làm phần "Còn lại" đúng kế hoạch, không lập lại kế hoạch, không đọc lại các file đã ghi ở "Đã đọc và rút ra" trừ khi cần sửa. Xong thì làm theo `docs/workflows/finish.md`, bước kiểm chứng để trống cho Claude.
3. Codex xong → commit + handoff (Agent vừa làm: codex).
4. Diff nhạy cảm → khi có token, trong Claude gõ: `Dùng verifier-security cho git diff main...HEAD -- <file>, spec: <mục>` (hoặc `verifier-db`). Sửa mục "Chặn merge" → merge.

### 7.4 Tránh trùng việc khi dùng hai agent

- Một mục gap matrix chỉ có một nhánh; ghi agent vào cột "Nhánh" (`feat/x (codex)`).
- Kế hoạch sai → agent ghi vào "Đề xuất thay đổi" trong plan và dừng; bạn quyết, không để agent thứ hai tự lập kế hoạch mới.
- Không nhờ agent thứ hai "xem lại toàn bộ" — chỉ diff nhạy cảm, một lần.
- Cuối tuần ghi chi phí **cả hai** vào bảng của gap matrix để biết việc nào rẻ hơn ở đâu.
