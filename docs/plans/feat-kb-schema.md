# Kế hoạch `feat/kb-schema` (nhánh `feat-kb-schema`) — Bảng kiến thức `kb_*`

## Việc

Mã gap matrix: `KB-SCHEMA` · Spec: `docs/10_Database_Design.md` §3.4 (`kb_sources`, `kb_chunks`, `kb_versions`), §4 (RLS), FR-050, FR-055, FR-130, FR-131, FR-133, FR-139.

**Tóm tắt:** Tạo ba bảng lưu kiến thức của shop: nguồn (`kb_sources`), phiên bản xuất bản (`kb_versions`) và đoạn kiến thức đã cắt (`kb_chunks`, có cột vector `halfvec(1024)` — kiểu số 16-bit của pgvector để tìm theo nghĩa). Mọi bảng có `workspace_id` + RLS (chính sách ở mức dòng: workspace này không thấy dữ liệu workspace khác). Extension pgvector đã có sẵn ở DB dev/CI (`CREATE EXTENSION vector` trong init) nên làm đủ cột vector, không cần phương án dự phòng `bytea`. Rủi ro: migration mới (0031) — chạy trên `cf_test`/CI, không đụng staging.

## Điểm chưa rõ

Không có. Các chỗ spec chưa nêu đã tự chọn phương án an toàn, ghi ở `QUYET_DINH_CHO_DUYET.md` mục QKB1.

## Tiêu chí nghiệm thu

1. `kb_sources`, `kb_versions`, `kb_chunks` tồn tại trong schema `cf`, có RLS bật, mỗi lệnh cf_app có quyền đều có policy dựa vào `current_workspace_id()` — kiểm bằng `pnpm db:check-rls` (không vi phạm).
2. Workspace B không đọc/ghi được dòng của workspace A ở cả ba bảng; INSERT với `workspace_id` của workspace khác bị chặn — kiểm bằng `kb-schema.int.test.ts` (FR-050).
3. Ghi theo vai trò: `kb_sources` Owner hoặc hệ thống; `kb_versions` Owner hoặc hệ thống, chỉ INSERT (bất biến); `kb_chunks` chỉ hệ thống; Staff, người ngoài, `withWorkspace` trần bị chặn — kiểm bằng cùng test.
4. Khóa ngoại ghép chặn đoạn trỏ tới nguồn/phiên bản của workspace khác (SQLSTATE 23503) — kiểm bằng test.
5. Cột `embedding` là `halfvec(1024)`: lưu được vector 1024 chiều, từ chối chiều khác, truy vấn `<=> $1::halfvec` chạy được (FR-139) — kiểm bằng test.
6. CHECK: đoạn nháp có `version_id` rỗng, đoạn đã xuất bản bắt buộc có `version_id`; `valid_until` > `valid_from`; `lang` ∈ {vi,en}; `chunk_key` duy nhất theo (nguồn, phiên bản) — kiểm bằng test (FR-055, FR-131).
7. `pnpm check:migrations`, `lint`, `typecheck`, `depcruise`, `check:plans`, `test:trace` xanh.

## File sẽ đọc

`docs/10_Database_Design.md` §3.4/§4 · `migrations/0019_ch_schema.sql` (mẫu RLS) · `schema/cf/posts.ts` (mẫu drizzle) · `schema/core/common.ts` · `tests/ch-rls.int.test.ts` (mẫu test) · `src/check-rls.ts` (đối chiếu).

## File sẽ sửa / tạo

- `packages/db/src/schema/cf/kb.ts` (tạo) · `schema/cf/index.ts` (export)
- `packages/db/migrations/0033_kb_schema.sql` + `meta/*` (drizzle-kit sinh; phần RLS viết tay)
- `packages/db/tests/kb-schema.int.test.ts` (tạo, viết trước)
- `docs/10_Database_Design.md` §3.4, §4; `docs/plans/QUYET_DINH_CHO_DUYET.md`; `docs/gap-matrix.md`; `docs/plans/MASTER.md`; `docs/codemap.md`; `docs/testing/KIEM_TRA_TAY.md`; `docs/handoff/feat-kb-schema.md`

## Migration

`0033_kb_schema.sql`: 3 bảng + khóa ngoại ghép + chỉ mục (B-tree `(workspace_id, version_id)`, `(workspace_id, product_id)`, GIN `tsv`; **HNSW và chỉ mục `embedding_model` để `KB-EMBED-COL`**) + RLS/GRANT viết tay. Đường lùi: `DROP TABLE cf.kb_chunks, cf.kb_versions, cf.kb_sources CASCADE` (bảng mới, chưa có dữ liệu thật). Chỉ chạy trên `cf_dev`/`cf_test`/`cf_ci`.

## Test viết trước

`kb-schema.int.test.ts` viết và chạy đỏ (bảng chưa có) trước khi tạo migration.

## Lệnh test phạm vi hẹp

`CF_LANE=b pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/kb-schema.int.test.ts` · `CF_LANE=b pnpm db:check-rls`

## Cần kiểm chứng độc lập không?

**Có** — `verifier-db` một lần (migration + RLS).

## Rủi ro / câu hỏi cho chủ dự án

`kb_chunks.product_id` chưa có khóa ngoại (bảng `products` do `PRODUCTS-VARIANTS` tạo; nhánh đó thêm FK). `tsv` do worker lập chỉ mục điền (cấu hình theo `lang`, `unaccent` không `IMMUTABLE` nên không dùng cột sinh).

## Đề xuất thay đổi

Cập nhật `docs/10` §3.4 và §4 cho khớp (ghi ở QUYET_DINH_CHO_DUYET).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

Policy GHI: `kb_sources`/`kb_versions` theo vai trò (Owner qua `withActor`, hoặc hệ thống `withJob`); `kb_chunks` chỉ hệ thống (`withJob`); SELECT theo thành viên đang hoạt động / hệ thống / `withWorkspace` trần.

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec hoặc ghi ở QKB1).
