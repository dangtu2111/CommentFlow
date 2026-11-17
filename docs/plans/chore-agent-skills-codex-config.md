# Kế hoạch `chore-agent-skills-codex-config` — lưu 3 skill agent và cấu hình Codex vào repo

> Trạng thái duyệt: **Đã duyệt** (chủ dự án yêu cầu 17/11/2026: đẩy các file chưa commit lên GitHub trước khi xóa thư mục).

## Việc

Mã gap matrix: không (cải tiến quy trình) · Spec: `AGENTS.md` § Phối hợp nhiều agent.

**Tóm tắt:** Đưa vào repo 3 skill dùng chung cho agent (`systematic-debugging`, `test-driven-development`, `verification-before-completion`) và `.codex/config.toml` để không mất khi xóa thư mục máy. Chỉ thêm file tài liệu/cấu hình, không đụng mã sản phẩm. Rủi ro thấp: đã kiểm `.codex/config.toml` không chứa khóa/mật khẩu.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Nhánh chỉ thêm 4 file: 3 `SKILL.md` dưới `.agents/skills/` và `.codex/config.toml` — kiểm bằng: `git diff --stat origin/main`.
2. `.codex/config.toml` không chứa khóa/token — kiểm bằng: đọc file; gitleaks xanh ở CI.
3. `pnpm precheck` xanh — kiểm bằng: chạy lệnh.

## File sẽ đọc

`.codex/config.toml`.

## File sẽ sửa / tạo

`.agents/skills/systematic-debugging/SKILL.md`, `.agents/skills/test-driven-development/SKILL.md`, `.agents/skills/verification-before-completion/SKILL.md`, `.codex/config.toml`, `docs/plans/chore-agent-skills-codex-config.md`.

## Migration

Không có.

## Test viết trước

Không áp dụng (chỉ thêm tài liệu/cấu hình).

## Lệnh test phạm vi hẹp

`pnpm precheck`.

## Cần kiểm chứng độc lập không?

Không.

## Complexity tracking

Không có.
