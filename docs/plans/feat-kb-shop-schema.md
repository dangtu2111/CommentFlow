# Kế hoạch `feat/kb-shop-schema` — migration 0085: trường mới của Thông tin cửa hàng + bảng đề xuất

## Việc

Mã gap matrix: `KB-SHOP-V2` (PR3/5). Kế hoạch chung: `docs/plans/feat-kb-shop-v2.md`. **DỪNG: migration — chờ chủ dự án merge** (nhãn "tự kiểm, chưa có kiểm chứng độc lập").

**Tóm tắt (2–3 câu dễ hiểu):** Thêm vào bảng `shop_profiles` các cột mới (khẩu hiệu, ngành, tên pháp lý, mã số thuế, giờ làm việc, kênh liên hệ, chi nhánh tối đa 10) và một bảng mới `shop_profile_suggestions` để chứa đề xuất từ Shopify/văn bản thô chờ Owner bấm Áp dụng hoặc Bỏ. Hệ thống (worker) chỉ được chèn đề xuất ở trạng thái nháp; chỉ Owner được áp dụng/bỏ, và máy chủ ghi ai quyết lúc nào. Rủi ro thấp: chỉ-thêm, chưa có code nào dùng; mọi giá trị ≤ 500 ký tự và không số tiền (Zod chặn từng giá trị, DB chặn tổng độ dài).

## Điểm chưa chốt

Không có (số chi nhánh tối đa 10 và cách lưu ngày trong tuần đã chốt ở `q-kb-shop-v2.md`).

## Tiêu chí nghiệm thu

1. Cột mới có CHECK: ≤ 10 chi nhánh/ngành, đúng kiểu jsonb, độ dài ≤ 500 (slogan/tên pháp lý/MST), tổng độ dài jsonb có trần — `packages/db/tests/kb-shop-v2.int.test.ts`.
2. `shop_profile_suggestions`: thành viên đọc; Owner ghi; hệ thống chỉ chèn/sửa NHÁP; Staff không ghi; workspace khác không thấy; mỗi (workspace, lang, field, source) tối đa một nháp; `kb_text` bắt buộc trích dẫn.
3. Chỉ Owner đặt `applied`/`rejected`; `decided_by/decided_at` do máy chủ đóng dấu; bản đã quyết không bị hệ thống đổi.
4. Zod ở `packages/shared/src/shop-profile.ts` (≤ 500 ký tự, không số tiền, tối đa 10 chi nhánh, một chi nhánh chính, giờ HH:MM, ngày 1–7) — `shop-profile.test.ts`.
5. `pnpm db:check-rls` đạt; `pnpm --filter @flow/db test:db` 88 file / 1008 test xanh; đường lùi ghi trong chú thích 0085.

## File sẽ đọc / sửa

Thêm: `packages/db/migrations/0085_kb_shop_v2.sql`, `packages/shared/src/shop-profile.ts` (+test), `packages/db/tests/kb-shop-v2.int.test.ts`. Sửa: `packages/db/migrations/meta/_journal.json`, `packages/db/src/schema/cf/kb-content.ts`, `packages/db/src/check-rls.ts`, `packages/shared/src/index.ts`.

## Migration

`0085_kb_shop_v2.sql`, chỉ-thêm (cột có DEFAULT/NULL hằng nên không viết lại bảng; bảng mới chưa có dữ liệu), `SET LOCAL lock_timeout = '5s'`. Đường lùi trong chú thích đầu file.

## Test viết trước

Có (test tích hợp RLS/trigger và Zod).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db test:db` · `pnpm db:check-rls` · `pnpm --filter @flow/shared exec vitest run src/shop-profile.test.ts`.

## Cần kiểm chứng độc lập không?

Có — migration/RLS/trigger: **tự kiểm theo `docs/workflows/verify.md` (mục A + B), chưa có kiểm chứng độc lập; KHÔNG tự merge.**

### Kết quả tự kiểm (mở lại diff như người lạ)

- A1 cô lập workspace: bảng mới có `workspace_id` + RLS bật, 4 policy (select/insert/update/delete) cùng lọc `workspace_id = current_workspace_id()`; test "workspace khác không thấy" đạt. A6 quyền: Owner qua `core.is_workspace_owner()`, hệ thống qua `core.is_system_context()` (chỉ khi không có người dùng), Staff chỉ đọc (test). A7 đầu vào: Zod (giá trị ≤ 500, không số tiền) + CHECK DB; SQL thuần tham số, không nối chuỗi. A5 số tiền: không có đường số tiền; Zod từ chối mẫu tiền. A2: không log nội dung; không chạm token/PII.
- B1: RLS + policy theo mẫu 0083 (hàm `core.current_workspace_id()`, thiếu giá trị trả 0 dòng); `db:check-rls` đạt. B2: chỉ ADD COLUMN có DEFAULT hằng (không viết lại bảng) + bảng mới; `lock_timeout` 5s; đường lùi ghi rõ. B3: index `(workspace_id, status, lang)` và unique một phần cho nháp. B4: không có tiền; thời gian `timestamptz`. B5: khác `docs/10_Database_Design.md` ở chỗ có thêm cột/bảng này (tài liệu sẽ cập nhật khi PR4–5 xong).
- Điểm cần chủ dự án chú ý: (1) hệ thống cũng được phép UPDATE `shop_profiles` (policy cũ Owner-hoặc-hệ thống, không đổi); PR4 chỉ Owner lưu form; (2) trigger tăng `updated_at` nhưng KHÔNG có `rev` (khác policy_facts) vì đề xuất không cần phiên bản.

## Rủi ro / câu hỏi cho chủ dự án

Không. Sau khi merge, PR4 (`feat/kb-shop-form-sync`) mới dùng các cột; PR5 ghi đề xuất.
