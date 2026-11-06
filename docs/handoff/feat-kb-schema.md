# Bàn giao `feat-kb-schema` (làn b, claude) — KB-SCHEMA

## Đã làm
- Migration `0033_kb_schema.sql`: `cf.kb_sources`, `cf.kb_versions` (bất biến), `cf.kb_chunks` (`halfvec(1024)`, `tsv`, `context_header`, `valid_*`, `embedding_model`) + RLS/GRANT viết tay (QKB1). Schema drizzle `packages/db/src/schema/cf/kb.ts`.
- Test tích hợp `packages/db/tests/kb-schema.int.test.ts` (RLS chéo workspace, ghi theo vai trò, FK ghép, CHECK, halfvec, tsv).
- Docs: `docs/10` §3.4/§4, QUYET_DINH (QKB1), gap-matrix, MASTER, codemap, KIEM_TRA_TAY (KT-016).

## Đã đọc và rút ra
- pgvector đã có (`infra/postgres/init/10-roles-and-databases.sh`, image `pgvector/pgvector:0.8.7-pg16` ở CI) → không cần phương án `bytea`.
- Mẫu RLS = migration 0019; `check-rls` đòi mỗi quyền cf_app có đúng policy theo lệnh; hệ thống = `withJob` qua `cf_worker`.
- Worktree không có `.env`, agent không được tạo → **test tích hợp/migrate/check-rls chưa chạy cục bộ**; CI job `database` sẽ chạy. Đã chạy: lint, typecheck, depcruise, check:plans, check:migrations, test:trace, test đơn vị db.

## Còn lại
- `KB-EMBED-COL`: HNSW `embedding halfvec_cosine_ops` + chỉ mục `(workspace_id, embedding_model)`.
- `PRODUCTS-VARIANTS`: thêm FK `kb_chunks.product_id` → `products`.
- Không có mục `CAN_BAN_CUNG_CAP` (không dùng tài nguyên ngoài).

## Sau verifier-db (không có "Chặn merge")
- Đã sửa: `lock_timeout` + kiểm extension `vector >= 0.7` đầu migration; `kb_versions_insert` ép `published_by` = người gọi (Owner); `check-rls` thêm NO_DELETE + quyền cột cho `kb_*`.
- Ghi nhận cho việc sau: xuất bản chunk = sao chép sang `version_id` mới rồi xóa nháp (không UPDATE `version_id`); xóa mềm nguồn chưa tự xóa chunk (KB-PUBLISH/KB-CHUNKING phải lọc/xóa); Owner hiện sửa được `status`/`sync_error` của nguồn (cân nhắc trigger khi làm đồng bộ); FK `product_id` ở PRODUCTS-VARIANTS; lùi migration sau khi có dữ liệu dùng migration mới, không DROP.
