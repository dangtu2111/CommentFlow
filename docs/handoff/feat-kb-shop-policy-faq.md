# Bàn giao `feat-kb-shop-policy-faq` (claude, làn b)

## Đã làm

KB-SHOP-POLICY-FAQ (FR-050/142): migration 0036 (4 bảng `shop_profiles`, `policy_items`, `faq_items`, `brand_voice` + RLS Owner/hệ thống ghi, Staff đọc), schema drizzle `schema/cf/kb-content.ts`, hàm ghi/đọc `queries/kb-content.ts`, kiểm đầu vào Zod `packages/shared/src/kb-content.ts` (+ test), cập nhật `check-rls.ts`, docs/10, QKB2, gap-matrix, MASTER, codemap, KT-023.

## Đã đọc và rút ra

- Mẫu RLS = `0033_kb_schema.sql`; mẫu check-rls: thêm vào `ACTOR_POLICIES`, `NO_DELETE_TABLES`, danh sách cột cấm UPDATE.
- `@flow/shared` có ngưỡng coverage 100% dòng/câu lệnh, 93% nhánh.
- Làn này không có DB: `pnpm test:db` không chạy được ở đây → `kb-content.int.test.ts` và `db:check-rls` chạy ở CI.

## Còn lại

- `KB-CONTENT-UI` (giao diện 4 phần + Server Action), `KB-SCOPE-CHANNEL`, `KB-CHUNKING` (không coi số tiền trong FAQ/chính sách là nguồn giá).
- `check-rls`: marker cho policy DELETE; CHECK độ dài ở DB cho `question`/`title`/`name`.
- `id` đầu vào hàm update/delete cần kiểm UUID ở nơi gọi (tránh 22P02).
