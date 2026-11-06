# Bộ điều phối nhiều làn (`tools/orchestrator`)

Chạy hàng đợi việc trên nhiều làn song song: mỗi việc = một agent Claude làm trong worktree của làn → mở PR → bộ điều phối chờ CI **xong thật** → merge, hoặc gọi agent sửa (tối đa 2 lần/PR) → hoặc báo **KẸT**. Chỉ dùng stdlib Node (không thêm phụ thuộc). Căn cứ: `docs/decisions/012-orchestrator-kit.md`; quy tắc làn/DB: `docs/workflows/parallel.md`.

## Thiết lập (một lần cho mỗi dự án)

1. Sao `tools/orchestrator/orchestrator.config.example.json` thành `orchestrator.config.json` ở gốc repo, sửa `repo`, `lanes.*.dir`, `verifyCommands`. File này chỉ chứa cấu hình, **không chứa bí mật**.
2. Tạo làn theo `tools/orchestrator/templates/lane-checklist.md` (worktree riêng, DB test riêng nếu có).
3. `node tools/orchestrator/bin/orchestrator.mjs validate` → báo "Config hợp lệ".
4. Viết mô tả mỗi việc ở `orchestrator/prompts/<tên-task>.md` (tùy chọn nhưng nên có; dựa trên `templates/HEAD.md`).
5. Cần `gh` đã đăng nhập (`gh auth status`) và `claude` trong PATH.

Cấu hình chính (mặc định trong `src/config.mjs`):

| Khóa | Ý nghĩa |
|---|---|
| `repo` | `chủ/tên` trên GitHub |
| `baseBranch`, `branchPrefix` | nhánh gốc; tiền tố nhánh (`feat/`) → nhánh của task = tiền tố + tên task |
| `lanes.<làn>` | `dir` (worktree), `model` mặc định, `testDb`, `migration: true` (đúng một làn) |
| `verifyCommands` | lệnh kiểm tra/CI mà agent phải chạy xanh trước khi đẩy (đưa vào prompt) |
| `maxFixesPerPr` | số lần sửa tối đa cho mỗi PR (mặc định 2) |
| `ci.*` | `pollSeconds`, `timeoutMinutes`, `noChecksGraceSeconds`, `requireChecks`, `ignoreChecks` |
| `merge.method` | `squash` \| `merge` \| `rebase` (phía GitHub) |
| `agent.*` | `command`, `defaultModel`, `allowedTools`, `disallowedTools` (mặc định cấm force-push/rebase/`add -A`), `maxMinutes` |
| `log.format` | `text` hoặc `json` (JSON-lines) |

## Dùng

```
node tools/orchestrator/bin/orchestrator.mjs start <làn> <bước...> [--config file] [--dry-run]
node tools/orchestrator/bin/orchestrator.mjs alerts      # đọc file cảnh báo
```

| Bước | Việc làm |
|---|---|
| `task:<tên>[@mô hình]` | Chuẩn bị nhánh `<tiền tố><tên>` trong worktree làn (không ép, không ghi đè; worktree bẩn → dừng) → chạy agent với prompt `HEAD` + mô tả việc → tìm PR **theo tên nhánh** → chờ CI → merge/sửa/kẹt |
| `fix:<pr>[@mô hình]` | Bỏ qua bước viết; đưa PR có sẵn qua vòng chờ CI/sửa/gỡ xung đột/merge |
| `wait:<làn>` | Chờ làn kia ghi dấu `.done`; làn kia `.stuck` thì dừng làn này |

Ví dụ: `start a task:pii-mask@opusplan task:size-table wait:b task:report` — `--dry-run` in trước mô hình sẽ dùng cho từng bước (bước > `lanes.<làn>.model` > `agent.defaultModel`).

Ghi ra `<stateDir>` (mặc định `.orchestrator/`, đã gitignore): `<làn>.log` (nhật ký), `alerts.txt` (mỗi dòng: thời điểm, loại, làn, nội dung), `<làn>.done`/`<làn>.stuck`. Ba loại cảnh báo: **MERGED** (PR đã merge), **KẸT** (kèm lý do), **HẾT HÀNG ĐỢI** (làn làm xong mọi bước). Theo dõi: `tail -f .orchestrator/alerts.txt`.

Quyết định merge/sửa/kẹt (`src/decide.mjs`): CI xanh + không xung đột → merge · còn check đang chạy → chờ (không đếm đỏ) · CI đỏ hoặc xung đột → gọi agent sửa (prompt `ci-fix`/`conflict`), tối đa `maxFixesPerPr` · hết lượt, agent không đẩy commit mới, CI quá hạn, PR bị đóng, hoặc **lặp cùng "NGUYÊN NHÂN GỐC"** (dòng agent phải in cuối mỗi lần sửa) → KẸT.

Không bao giờ (bộ điều phối tự giữ, `src/safe-git.mjs`): `git push`, `rebase`, `reset`, `add`, `--force`. Agent bị cấm bằng `disallowedTools` và prompt.

## Chia làn

| Làn | Vai trò | Ghi chú |
|---|---|---|
| Migration | **Duy nhất một làn** có `migration: true`; mọi việc thêm bảng/cột/policy xếp ở đây, tuần tự | Hết chạy đua số migration |
| Giao diện | Chủ yếu `apps/web`, test đơn vị | Không cần DB làn; mô hình rẻ |
| Logic | Quy tắc nghiệp vụ, thư viện dùng chung; test trước | Có DB test riêng nếu có test tích hợp |
| Gỡ kẹt tạm | Làn tạm cho `fix:<pr>` khi làn chính đang bận | Tạo worktree mới, chạy xong `git worktree remove` |

Dùng `wait:<làn>` khi việc làn này cần việc của làn khác đã merge (ví dụ UI chờ bảng của làn migration).

## Chọn mô hình theo độ khó

| Việc | Mô hình |
|---|---|
| Thường: thêm tính năng theo mẫu, UI, test, tách chuỗi | `sonnet` |
| Khó vừa-nhiều ràng buộc: logic quy tắc, thiết kế có phương án, thay đổi chạm nhiều tầng | `opusplan` (lập kế hoạch bằng mô hình mạnh, viết bằng mô hình thường) |
| Rất khó/nhạy cảm: auth, RLS, thanh toán, gỡ kẹt đã sửa sai 2 lần | `fable` |
| Cơ học kiểm được bằng công cụ | mô hình nhỏ; không giao logic nhạy cảm |

Gợi ý: để mặc định rẻ ở `lanes.<làn>.model`, chỉ nâng bằng `@mô hình` cho bước khó. Việc sửa lần hai nên nâng mô hình hơn là lặp lại cùng mô hình.

## Quy tắc hỏi và tài nguyên ngoài

Prompt khung đã nhúng sẵn: agent chạy không có người trả lời nên **không hỏi** — tự chọn phương án an toàn/đảo ngược được và ghi quyết định (theo `AGENTS.md` § Quy tắc hỏi). Việc cần khóa/dịch vụ ngoài: viết code thật sau interface + mock/fixture, cờ mặc định TẮT, ghi vào danh sách "cần chủ dự án cung cấp" (`AGENTS.md` § Tài nguyên ngoài). Dự án khác: sửa các đoạn này trong `templates/HEAD.md` (hoặc đặt bản riêng ở `<promptDir>/_templates/HEAD.md` — bản của dự án được ưu tiên).

## Bài học (lỗi đã gặp → cách tránh)

1. **Tìm PR theo nhánh sai dấu `/` và `-`** (`feat/x` ≠ `feat-x`) → báo KẸT giả. Nay: nhánh = tiền tố + tên task, tìm theo `headRefName` chính xác, thử thêm biến thể (`src/branches.mjs`); agent phải mở PR đúng tên nhánh (prompt nói rõ).
2. **`gh pr checks --watch` trả sớm** (khi CI chưa kịp tạo check, hoặc sau push chưa chạy lại) → đếm đỏ/kẹt giả. Nay: tự thăm dò, chỉ kết luận khi **không còn check pending**; sau bản sửa chờ tới khi commit đầu PR đổi (tránh đọc kết quả cũ) (`src/checks.mjs`).
3. **Số migration chạy đua giữa nhánh** → xung đột, `check:migrations` đỏ. Nay: chỉ một làn có migration; prompt migration bảo xem cả PR đang mở và nhảy số khi `main` đổi.
4. **File chung (codemap, QUYẾT_ĐỊNH, gap matrix) gây xung đột** mỗi lần merge. Nay: mỗi nhánh thêm **fragment/dòng riêng** (vd. `docs/codemap.d/<task>.md`), không sửa cả file; prompt gỡ xung đột bảo giữ cả hai phía.
5. **Gỡ PR kẹt khi làn bận**: đừng chen vào worktree đang chạy; tạo **worktree tạm** (làn tạm trong config) rồi `fix:<pr>`.
6. **Không dùng chung worktree cho 2 agent** (chung chỉ mục/`HEAD` → commit lẫn). Mỗi làn một thư mục; bộ điều phối từ chối worktree bẩn.
7. **CI bị chặn do billing/quota** (không có check nào chạy) → trông như "không có CI" hoặc treo. Nay: `ci.requireChecks` + `noChecksGraceSeconds` báo KẸT rõ lý do. Cách phòng: repo public (CI miễn phí) hoặc giảm số job CI; kiểm tra billing trước khi xếp hàng dài.
8. **Driver bash đang chạy không sửa tại chỗ** (bash đọc script theo từng đoạn, sửa giữa chừng làm chạy sai). Nay: logic nằm trong Node đã nạp vào bộ nhớ; muốn đổi hành vi thì dừng làn, sửa, chạy lại bằng `start` (bước đã merge sẽ không làm lại vì nhánh/PR đã có).
9. **"Đã chạy xong" của lệnh nền chỉ nghĩa là đã khởi chạy**, không phải thành công. Kết quả thật phải đọc từ `alerts.txt` (MERGED/KẸT/HẾT HÀNG ĐỢI), không từ thông báo của lệnh nền.
10. **Sửa lặp vô ích**: sửa 2 lần cùng một lỗi. Nay: dòng `NGUYÊN NHÂN GỐC:` bắt buộc; trùng với lần trước → KẸT ngay, chuyển người/mô hình mạnh hơn (`fix:<pr>@fable`).
11. **Hỏi chủ dự án giữa chừng làm làn đứng** → quy tắc hỏi và mock tài nguyên ngoài nằm trong prompt (mục trên).
