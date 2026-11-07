# DB dài hạn (cf_dev) lệch với file migration

**Triệu chứng:** `pnpm db:check-rls` ở dev báo thiếu bảng/trigger (ví dụ `relation "core.workspace_deletion_requests" does not exist`) trong khi CI xanh; hoặc `pnpm db:migrate` in dòng `CẢNH BÁO: DB lệch với file migration …`.

**Nguyên nhân (đã gặp 07/11/2026 với 0055, 0025, 0026, 0058, 0062):** drizzle chỉ áp migration có mốc `when` LỚN HƠN bản đã áp mới nhất. Khi hai nhánh song song cùng thêm migration, hoặc một migration bị đổi mốc/đổi nội dung SAU khi đã áp lên DB dev, DB dài hạn bỏ qua nó âm thầm. CI chạy trên DB sạch (áp từ đầu) nên không bị. Một DB dev lệch có thể che lỗi thật (test chạy trên schema khác với `main`).

**Phòng ngừa:** không sửa nội dung migration đã merge (thêm migration mới); không đổi `when` của migration đã áp. Mỗi lần `pnpm db:migrate` tự so mã băm sha256 của file với sổ `drizzle.__drizzle_migrations` và cảnh báo nếu lệch (`packages/db/src/migration-drift.ts`).

**Cách sửa (chỉ `cf_dev`, KHÔNG dùng cho staging/production):**
1. `pnpm db:migrate` — đọc danh sách file bị cảnh báo.
2. `pnpm --filter @flow/db db:repair-dev <tên-migration> [...]` (ví dụ `0055_workspace_deletion`): phát lại có kiểm soát — mỗi câu trong savepoint, câu "đã tồn tại" bỏ qua, hàm/policy/trigger thay bằng bản hiện tại, câu sửa dữ liệu bỏ qua, rồi ghi sổ mã băm. Chạy theo thứ tự journal nếu nêu nhiều tên.
3. `pnpm db:check-rls` — phải xanh; `pnpm db:migrate` — không còn cảnh báo.
4. DB test/CI lệch thì xóa schema rồi áp lại từ đầu (`resetTestSchemas`) thay vì sửa.

**Giới hạn:** `db:repair-dev` chỉ tạo/thay đối tượng schema, không chạy lại câu sửa dữ liệu của migration cũ (đã chạy ở lần áp đầu). Muốn DB dev sạch hoàn toàn thì dựng lại `cf_dev` từ đầu (mất dữ liệu dev).
