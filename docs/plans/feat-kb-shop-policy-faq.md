# Kế hoạch `feat-kb-shop-policy-faq` — Thông tin shop, chính sách, FAQ, giọng văn + quy tắc

## Việc

Mã gap matrix: `KB-SHOP-POLICY-FAQ` · Spec: FR-050, FR-142, `docs/10_Database_Design.md` §3.3 (`brand_voice`), §3.4 (`faq_items`).

**Tóm tắt:** Dựng lớp dữ liệu cho bốn phần kiến thức nhập tay: thông tin cửa hàng, chính sách, FAQ, giọng văn + quy tắc "nên/không nên" theo ngôn ngữ (vi/en; mục chung chọn "cả hai"). Gồm bốn bảng mới có `workspace_id` + RLS (chính sách mức dòng: workspace này không thấy workspace khác), kiểm đầu vào bằng Zod ở `@flow/shared`, và các hàm ghi/đọc. Chưa có giao diện (việc riêng) và chưa cắt đoạn/embedding (`KB-CHUNKING`). Rủi ro: migration mới 0036, chỉ chạy trên `cf_dev`/`cf_test`/`cf_ci`; làn này không có DB nên test tích hợp chạy ở CI.

## Điểm chưa rõ

Không có. Các chỗ spec chưa nêu đã tự chọn phương án an toàn, ghi ở `QUYET_DINH_CHO_DUYET.md` mục QKB2.

## Tiêu chí nghiệm thu

1. `shop_profiles`, `policy_items`, `faq_items`, `brand_voice` tồn tại ở schema `cf`, RLS bật, mỗi lệnh có đúng một policy — `pnpm db:check-rls` không vi phạm (CI).
2. Owner và hệ thống ghi được; Staff, người lạ, `withWorkspace` trần bị chặn ghi (42501); workspace B không thấy/sửa/xóa/chèn vào workspace A — `kb-content.int.test.ts` (FR-050).
3. `(workspace, lang)` duy nhất cho hồ sơ shop và giọng văn; CHECK `lang`, `kind`, xưng hô đúng ngôn ngữ, `custom` cần tên, nội dung ≤ 8000 — `kb-content.int.test.ts`.
4. Zod: hồ sơ shop (tên bắt buộc, website chỉ http/https), chính sách, FAQ (thẻ chuẩn hóa), giọng văn (xưng hô theo `isValidAddress`, quy tắc ≤ 20 mục, câu mời chỉ chủ đề đã biết) — `packages/shared/src/kb-content.test.ts`.
5. `shop_profiles`/`brand_voice` không có quyền DELETE cho `cf_app` — test tích hợp + `check-rls`.
6. `lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `check:migrations`, `test:trace`, `@flow/shared test:coverage` xanh.

## File sẽ đọc

`docs/10` §3.3/§3.4/§4 · `migrations/0033_kb_schema.sql` (mẫu RLS) · `schema/cf/kb.ts`, `products.ts` (mẫu drizzle) · `src/check-rls.ts` · `shared/src/reply-style.ts` (xưng hô) · `queries/products.ts` (mẫu truy vấn).

## File sẽ sửa / tạo

- `packages/shared/src/kb-content.ts` (+ `.test.ts` viết trước) · `index.ts`
- `packages/db/src/schema/cf/kb-content.ts` · `schema/cf/index.ts` · `queries/kb-content.ts` · `runtime.ts` · `check-rls.ts`
- `packages/db/migrations/0036_kb_shop_policy_faq.sql` + `meta/*`
- `packages/db/tests/kb-content.int.test.ts`
- `docs/10`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `gap-matrix.md`, `MASTER.md`, `codemap.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-kb-shop-policy-faq.md`

## Migration

`0036_kb_shop_policy_faq.sql`: 4 bảng + khóa ngoại + chỉ mục + RLS/GRANT viết tay. Đường lùi: `DROP TABLE cf.shop_profiles, cf.policy_items, cf.faq_items, cf.brand_voice CASCADE` (+ lùi `check-rls.ts`). Chỉ chạy trên `cf_dev`/`cf_test`/`cf_ci`.

## Test viết trước

`kb-content.test.ts` (Zod; chạy đỏ vì chưa có module) viết trước mã; `kb-content.int.test.ts` viết cùng migration, chạy ở CI.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/kb-content.test.ts` · `pnpm --filter @flow/shared test:coverage` · `CF_LANE=b pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/kb-content.int.test.ts` · `CF_LANE=b pnpm db:check-rls`

## Cần kiểm chứng độc lập không?

**Có** — `verifier-db` (migration + RLS) và `verifier-security` (RLS/quyền ghi giọng văn), mỗi loại một lần.

## Rủi ro / câu hỏi cho chủ dự án

Ghi chỉ Owner (Staff chỉ đọc) — nới bằng migration sau nếu muốn. Phạm vi theo kênh của FR-050 và "Quy tắc & giới hạn" ngoài nên/không nên (từ khóa chặn, hạn mức) sống ở `automation_settings` → gap `KB-SCOPE-CHANNEL`.

## Đề xuất thay đổi

Cập nhật `docs/10` §3.3/§3.4/§4 cho khớp (ghi ở QUYET_DINH_CHO_DUYET QKB2).

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

Policy GHI: cả bốn bảng theo vai trò — Owner qua `withActor` hoặc hệ thống `withJob`; SELECT theo thành viên đang hoạt động / hệ thống / `withWorkspace` trần.

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec hoặc ghi ở QKB2).
