# Kế hoạch `feat-price-snapshot` — Ảnh chụp giá lúc soạn (PRICE-SNAPSHOT)

## Việc

Mã gap matrix: `PRICE-SNAPSHOT` · Spec: FR-111, `docs/09` §6.1 R5, `docs/10` bảng `drafts`.

**Tóm tắt:** Khi AI soạn câu có số tiền, hệ thống chụp lại giá/tồn kho (từ `products`/`product_variants`) và lưu vào bản nháp (`drafts.price_snapshot`, kiểu jsonb = cột JSON). Ngay trước khi gửi, `sendRecheck` (kiểm lại lần cuối) đọc ảnh chụp này để biết giá có đổi không. Bảng `drafts` chưa tồn tại nên migration 0046 tạo bảng theo `docs/10` (RLS: chỉ hệ thống ghi lúc soạn; ảnh chụp bất biến sau khi tạo). Rủi ro: bảng mới rộng, nhưng chỉ làm đúng cột spec đã chốt; chưa nối pipeline/job gửi.

## Điểm chưa rõ

Không có (xem Q-PS1).

## Tiêu chí nghiệm thu

1. Hàm thuần dựng ảnh chụp từ sản phẩm/biến thể (bỏ mục không có giá, sắp xếp ổn định, loại trùng) và đọc lại JSON từ DB có kiểm Zod — kiểm bằng `packages/shared/src/price-snapshot.test.ts`.
2. Ảnh chụp chuyển được thành đầu vào R5 của `sendRecheck`; có `variantId` thì so đúng biến thể; giá/mốc đồng bộ đổi → `price_changed` — kiểm bằng `packages/ai/src/recheck/price-snapshot.test.ts` + `send-recheck.test.ts`.
3. `cf.drafts` có RLS: workspace khác không thấy; chỉ hệ thống INSERT; Staff/Owner chỉ UPDATE cột xử lý (không `price_snapshot`, `text`, `sources`…); CHECK trạng thái/mục tiêu — kiểm bằng `packages/db/tests/drafts.int.test.ts` (`CF_LANE=b pnpm test:db`) và `pnpm db:check-rls`.
4. Truy vấn lưu bản nháp kèm ảnh chụp và đọc lại ảnh chụp để đưa cho `sendRecheck` — kiểm bằng test tích hợp trên.
5. Coverage packages/shared, packages/ai không hạ — `test:coverage`.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/ai/src/recheck/send-recheck.ts` (kiểu R5) · `packages/db/src/check-rls.ts` (danh sách kỳ vọng) · `schema/cf/post-notes.ts`, `migrations/0045`, `queries/post-notes.ts`, `tests/post-notes.int.test.ts` (mẫu) · `schema/cf/products.ts` (cột giá) · `docs/10` dòng `drafts`.

## File sẽ sửa / tạo

- `packages/shared/src/price-snapshot.ts` (+test), export ở `index.ts` — kiểu + dựng + đọc ảnh chụp.
- `packages/ai/src/recheck/price-snapshot.ts` (+test), `send-recheck.ts` — thêm `variantId` tùy chọn vào mục R5; chuyển ảnh chụp → đầu vào R5.
- `packages/db/src/schema/cf/drafts.ts`, `schema/cf/index.ts`, `migrations/0046_drafts.sql` + meta, `queries/drafts.ts`, `check-rls.ts`, `tests/drafts.int.test.ts`.
- docs: `10_Database_Design.md`, `codemap.md`, `gap-matrix.md`, `MASTER.md`, `QUYET_DINH_CHO_DUYET.md`, `testing/KIEM_TRA_TAY.md`, `handoff/feat-price-snapshot.md`.

## Migration

0046 `drafts`: tạo `cf.drafts` (đủ cột `docs/10`, CHECK, chỉ mục, FK `workspace_id`), RLS + GRANT theo cột. Đường lùi: `DROP TABLE cf.drafts` + bỏ kỳ vọng ở `check-rls.ts` (chưa có nơi dùng ngoài truy vấn).

## Test viết trước

Test thuần ở shared/ai viết trước khi code; test tích hợp DB viết cùng migration.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/price-snapshot.test.ts` · `pnpm --filter @flow/ai exec vitest run src/recheck` · `CF_LANE=b pnpm test:db`.

## Cần kiểm chứng độc lập không?

Có: `verifier-db` (migration/RLS) và `verifier-security` (R5/sendRecheck, RLS) — mỗi bên một lần.

## Rủi ro / câu hỏi cho chủ dự án

Không có.

## Đề xuất thay đổi

Cập nhật `docs/10` mục `drafts` ghi thực tế 0046 (Q-PS1).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò: INSERT chỉ hệ thống (`is_system_context`); UPDATE thành viên hoặc hệ thống, chỉ cột xử lý

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-PS1).
