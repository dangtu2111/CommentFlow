# Checklist tạo một làn mới

Làn = một worktree + (nếu cần) một DB test riêng + một dòng trong `orchestrator.config.json`. Đánh dấu từng mục.

## Worktree

- [ ] Repo chính đang ở `main`, sạch: `git status`; `git fetch origin`.
- [ ] Tạo worktree **riêng cho làn**, thư mục anh em của repo: `git worktree add ../<repo>-lane-<làn> --detach origin/<base>` (bộ điều phối tự tạo nếu thư mục chưa có; tạo tay khi muốn cài sẵn).
- [ ] Trong worktree: cài phụ thuộc theo lệnh của dự án (ví dụ `corepack enable && pnpm install --frozen-lockfile`).
- [ ] Chủ dự án tự sao chép file bí mật (`.env*`) sang làn. Agent **không** đọc/in chúng.
- [ ] Một worktree = một agent. Không bao giờ để hai phiên chung một thư mục (chung `HEAD`, chung chỉ mục → hỏng commit của nhau).

## DB test theo làn (nếu dự án có test tích hợp)

- [ ] Tên DB `<tên>_test_<làn>` (chữ thường/số, làn ≤ 8 ký tự); điền `lanes.<làn>.testDb` trong config.
- [ ] Tạo DB trên máy chạy DB (idempotent), chạy migration lên DB đó.
- [ ] Biến môi trường chọn DB theo làn đặt trong cửa sổ/terminal của làn (không sửa file `.env` chung).
- [ ] Làn không có DB riêng thì **không** chạy test tích hợp chung với làn khác.

## Cấu hình

- [ ] Thêm làn vào `orchestrator.config.json`: `dir`, `model` mặc định (xem bảng chọn mô hình), `testDb`, `migration: true` **chỉ cho đúng một làn**.
- [ ] `orchestrator validate` báo hợp lệ; `orchestrator start <làn> task:<tên> --dry-run` in đúng mô hình.
- [ ] Mỗi việc có `orchestrator/prompts/<tên>.md` (mô tả việc, tiêu chí nghiệm thu, file được/không được đụng).

## Làn gỡ kẹt tạm

- [ ] Khi làn chính bận mà cần gỡ một PR kẹt: tạo làn tạm (`dir` mới) và chạy `start <làn-tạm> fix:<pr>`; xong thì `git worktree remove <dir>` và xóa khỏi config.

## Dọn dẹp

- [ ] Nhánh đã merge → `git worktree remove <dir>`; xóa tệp `.orchestrator/<làn>.done|.stuck` cũ.
