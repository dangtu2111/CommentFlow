# Handoff feat-e2e-ci (claude, làn c)

Đã làm: điều tra E2E-CI. Job `e2e` trên CI hiện xanh 6/6 (run 42147969146). Nguyên nhân gốc lỗi 2FA = Server Action đặt cookie phiên mới nhưng trang dựng lại cùng request đọc cookie CŨ → `/login` → `/app`; đã sửa ở 3896ea3 (`requestContext()` + `lib/cookie-header.ts`). Gap matrix cũ nghi chưa chính xác nên đã sửa lời. Không có thay đổi code.
File đã đọc: `e2e/support/flows.ts`, `security/actions.ts`, `two-factor-card.tsx`, handoff fix-2fa-backup-codes, log CI.
Còn lại: không. Chủ dự án vẫn nên chạy `pnpm e2e` cục bộ một lần (E2E-GATE0) nếu muốn xác nhận ngoài CI.
