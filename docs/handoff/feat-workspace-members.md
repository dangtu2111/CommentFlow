# Bàn giao `feat/workspace-members` (claude)

Kế hoạch đã duyệt: `docs/plans/feat-workspace-members.md`. ADR: `docs/decisions/005-loi-moi-thanh-vien.md`.

## Đã làm (M1–M5, tất cả đã commit)

- M1 `requireAppUser()` + `decideAppAccess` + test quét; khóa ký HKDF (`createSignedValueCodec`); `twoFactor.principal()`.
- M2 tạo workspace (múi giờ trong `WORKSPACE_TIME_ZONES`, ngôn ngữ vi/en, `action_logs`), bộ chuyển workspace (cookie `cf-workspace`).
- M3 thành viên (`createWorkspaceAdmin`): danh sách, đổi vai trò, tạm khóa/mở khóa/gỡ, Owner cuối cùng (trigger DB), email báo mọi Owner, `action_logs`.
- M4 lời mời: migration 0015 (cột, chỉ mục duy nhất, quyền cột, hàm `invitation_preview`/`accept_invitation`, trigger), thư mời, rate limit, `/invite/<token>` + cookie `cf-invite`.
- M5 tài liệu (docs/10, docs/13, ADR 005, gap matrix, codemap, design/stitch/README), migration 0015 đã áp lên `cf_dev`.

## Điều rút ra

- Web không được import giá trị từ `@flow/saas-core` trong file mà component client import (kéo `node:net` vào bundle trình duyệt, Turbopack panic) → tách `lib/workspace-form.ts` (kiểu + IDLE) và `lib/workspace-form-parse.ts`.
- `auth.ts` ↔ `invite-cookie.ts` từng vòng phụ thuộc → hằng số ở `lib/invite-token.ts`.
- Hàm DEFINER: `search_path` không có `public` nên citext so bằng `lower(x::text)`; tên cột trả về khác tên cột bảng.
- Test `admin-session-cap` ("created_at ở tương lai") đỏ vì đồng hồ máy ảo lệch ~1,07 giây so với máy code — không liên quan nhánh này.
- Không có công cụ điều khiển trình duyệt trong phiên: kịch bản cổng 0 qua giao diện CHƯA chạy tự động (xem báo cáo).

## Còn lại

- Chạy kịch bản cổng 0 bằng tay ở vi và en (xem báo cáo cuối), rồi `/finish`: `verifier-security` + `verifier-db` (một lần), xóa plan + handoff khi kết thúc.
