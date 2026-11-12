# Kế hoạch `feat/kb-shop-form-sync` — PR4 của KB-SHOP-V2: form lưu trường mới, đưa vào kiến thức, tính độ sẵn sàng

## Việc

Mã gap matrix: KB-SHOP-V2 (PR4, theo `docs/plans/feat-kb-shop-v2.md`). PR3 (migration 0085) đã vào `main`.

**Tóm tắt (2–3 câu dễ hiểu):** Trang "Thông tin cửa hàng" trước đây có nhiều ô bị tắt vì DB chưa có chỗ lưu. Nay DB đã có (PR3), nên bật các ô đó: khẩu hiệu, ngành, pháp lý, giờ mở cửa/giờ trực, Zalo/Shopee/TikTok, chi nhánh (tối đa 10). Khi đồng bộ kiến thức (`sync:shop`), các trường này được đưa vào đoạn "Thông tin shop" để AI trả lời được "shop ở đâu, mấy giờ mở, Zalo gì"; độ sẵn sàng của AI cũng tính thêm các trường mới. Rủi ro: dữ liệu mới là số điện thoại/địa chỉ công khai của shop — không ghi log; không số tiền (Zod chặn).

## Điểm chưa chốt

Không có (ngày trong tuần và số chi nhánh đã chốt ở `q-kb-shop-v2.md`).

## Tiêu chí nghiệm thu

1. Owner lưu được các trường mới (`withActor`), đọc lại đúng; để trống thì xóa; Staff không ghi được; workspace khác không thấy.
2. Đường lưu cũ (không kèm trường mới) giữ nguyên giá trị đang có (không xóa nhầm).
3. Đoạn kiến thức `shop:<lang>` có dòng khẩu hiệu, ngành, pháp lý, lịch mở cửa (T2–T7, CN), giờ hỗ trợ, Zalo/Shopee/TikTok, chi nhánh (chính đứng trước).
4. Readiness: giờ có cấu trúc, kênh liên hệ, địa chỉ chi nhánh được tính; truy vấn chỉ trả cờ có/không, không trả giá trị.
5. Form từ chối: giờ thiếu một nửa/sai định dạng, chi nhánh thiếu tên hoặc địa chỉ, quá 10 chi nhánh, có số tiền.
6. Không log số điện thoại; typecheck, `lint:i18n`, biome, test web/ai/db xanh.

## File sẽ đọc / sửa

Đọc: `packages/shared/src/shop-profile.ts`, `packages/db/src/schema/cf/kb-content.ts`, `packages/ai/src/kb-sync/*`, `readiness`.
Sửa: `packages/db/src/queries/kb-content.ts` (upsert/list), `queries/readiness.ts`; `packages/ai/src/kb-sync/source-documents.ts`, `readiness/readiness.ts`; `apps/web/src/lib/kb-content-form.ts`, `kb/actions.ts`, `components/kb/shop-sections.tsx`; i18n `vi/en`; `e2e/tests/kb-content.spec.ts`. Thêm `packages/db/tests/shop-profile-v2.int.test.ts`.

## Migration

Không (cột đã có từ 0085).

## Test viết trước

`source-documents.test.ts` (2 ca v2), `readiness.test.ts` (cờ mới), `kb-content-form.test.ts` (4 ca `formToShopProfileV2`), `shop-profile-v2.int.test.ts` (4 ca: lưu/đọc, đường cũ giữ nguyên + xóa, RLS/Staff, cờ readiness), E2E "trường mới lưu và hiện lại; chi nhánh thiếu địa chỉ bị từ chối".

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/kb-sync src/readiness` · `pnpm --filter @flow/web test` · `pnpm --filter @flow/db test:db tests/shop-profile-v2.int.test.ts` · `pnpm e2e e2e/tests/kb-content.spec.ts`.

## Cần kiểm chứng độc lập không?

Không: không đụng auth/RLS/migration/cổng tự gửi; chỉ dùng cột và RLS sẵn có, Owner-only. Dữ liệu vào kiến thức qua đường `sync:shop` có sẵn.

## Rủi ro / câu hỏi cho chủ dự án

- Form hiện chỉ lưu Zalo/Shopee/TikTok vào `contacts`; hotline và website vẫn ở cột cũ `contact`/`website` (PR5 sẽ áp dụng đề xuất vào đúng cột).
- Chưa chụp ảnh `ui:fidelity` lại cho `kb-shop` (chỉ bật các ô đã có trong thiết kế); đo lại ở PR5.
- E2E "Shopify" và 4 test Thử AI vẫn lỗi cục bộ như trên `main` (không do PR này).
