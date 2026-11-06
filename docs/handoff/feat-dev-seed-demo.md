# Handoff `feat-dev-seed-demo` (claude, làn d)

## Đã làm
- Gói `tools/dev-seed` (`pnpm dev:seed-demo [--reset]`), guard hai lớp, mật khẩu ngẫu nhiên in một lần, dữ liệu mẫu `[MẪU]` (42 bình luận, 4 sản phẩm, bản nháp, kiến thức, usage, nhật ký). 39 test đơn vị xanh.
- `AGENTS.md` (UI-FIRST, Stitch qua stitch-sync, ngoại lệ dữ liệu mẫu dev), `docs/workflows/feature.md`, `docs/testing/STANDARD.md` §6, Q-UIF1.
- Thêm export `insertDraft`, `linkProductsToPosts` vào `packages/db/src/runtime.ts`.

## Đã đọc và rút ra
- Ghi bảng hệ thống (kênh/bài/bình luận/bản nháp/usage) chỉ qua `withJob` trên pool `cf_worker`; `members` chỉ Owner đầu tiên tự thêm → Staff thêm bằng pool `cf_owner`; bảng auth chỉ `cf_auth` nên tài khoản tạo bằng `cf_owner` + `hashPassword`.

## Còn lại / chưa kiểm
- `seed.ts` CHƯA chạy với DB thật (làn d không có `.env`): chạy KT-DSD; lỗi có thể gặp: CHECK/RLS (`action_logs` actor_type, `ai_usage` INSERT bằng `cf_worker`), `--reset` xóa `action_logs`/user (FK).
- `DEV-SEED-DEMO-MORE`: leads, quy tắc spam, giọng văn, tin nhắn khi có bảng.
