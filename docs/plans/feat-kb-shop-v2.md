# Kế hoạch `feat-kb-shop-v2` — KB-SHOP-V2: làm lại tab "Thông tin cửa hàng" + đề xuất từ Shopify và văn bản thô

## Việc

Mã gap matrix: `KB-SHOP-V2` · chủ dự án giao 11/11/2026 (chế độ liên tục). **Một kế hoạch cho 5 PR chồng nhau**; PR3 là migration → DỪNG chờ chủ dự án.

**Tóm tắt (2–3 câu dễ hiểu):** Dựng lại trang `/app/kb/shop` theo thiết kế Stitch `kb-shop.png` (bản 390 px tự co bằng Tailwind vì không có ảnh mobile), rồi thêm các trường mới (khẩu hiệu, ngành, pháp lý, giờ mở cửa, kênh liên hệ, chi nhánh) và cho AI đọc chúng. Dữ liệu từ Shopify và từ văn bản thô được đổ vào dưới dạng ĐỀ XUẤT để Owner bấm Áp dụng/Bỏ, không tự ghi đè. Rủi ro: có migration (PR3, chỉ-thêm) và một bước chắt lọc mới tốn LLM (trong trần 0,20 USD/lần đồng bộ).

### Lệnh gốc của chủ dự án (chép nguyên văn phần liên quan vì chưa có trong repo)

> PHẦN 3 — KB-SHOP-V2. Làm lại tab "Thông tin cửa hàng" theo thiết kế (bản mobile 390 tự co bằng Tailwind vì không có ảnh mobile), rồi đổ dữ liệu thật từ Shopify và văn bản thô dưới dạng đề xuất để Owner duyệt. 5 PR chồng tiếp, kế hoạch `docs/plans/feat-kb-shop-v2.md` (một lần).
>
> PR1 `chore/stitch-kb-screens`: commit 10 ảnh Stitch chưa theo dõi trong `design/stitch` (kb-overview, kb-shop, kb-policies, kb-faq, kb-voice, kb-rules, kb-abbreviations, kb-catalog, kb-sandbox, kb-testlab), thêm hàng vào `design/stitch/README.md`. Chỉ đăng ký, không dựng các màn khác. Tự merge.
>
> PR2 `feat/kb-shop-ui` (UI-first Q-UIF1, ADR 013): dựng lại trang `/app/kb/shop` khớp `kb-shop.png` bằng Tailwind chép từ thiết kế, giữ dữ liệu 6 cột hiện có; các khối mới (giờ, chi nhánh, kênh liên hệ, pháp lý) dựng giao diện với trạng thái trống thật. Ngoài phạm vi, hiện nút tắt kèm chú thích: tài khoản ngân hàng/VietQR, AI trực ca đêm, Áp dụng kênh, So sánh thay đổi, Google Maps, tải ảnh; không hiện số mẫu; readiness thật. Không logic mới, không migration. Ảnh trước/sau `docs/plans/ui-fidelity/kb-shop/`, chạy `pnpm ui:fidelity kb-shop /app/kb/shop`. Tự merge.
>
> PR3 `feat/kb-shop-schema` (DỪNG: migration, chờ chủ dự án): chỉ-thêm. `shop_profiles` thêm `slogan`, `industries text[]`, `legal_name`, `tax_id`, `hours jsonb {open:{days,from,to}, support:{from,to}}`, `contacts jsonb {hotline, zalo, website, shopee, tiktok}`, `branches jsonb` (mảng {name, address, hours?, note, is_main}, tối đa 10). Bảng mới `cf.shop_profile_suggestions (workspace_id, lang, field, value text, evidence_quote, source 'shopify'|'kb_text', source_ref, status 'draft'|'applied'|'rejected', …)`: thành viên đọc, Owner/hệ thống ghi; hệ thống chỉ được chèn `'draft'`. Zod ở `packages/shared`, đường lùi ghi rõ trong migration. Mọi giá trị ≤ 500 ký tự, không số tiền (giá chỉ từ `products`). Mở PR rồi làm tiếp việc không phụ thuộc.
>
> PR4 `feat/kb-shop-form-sync`: form lưu các trường mới (Owner, `withActor`); `sync:shop` trong kb-sync đưa chi nhánh, giờ, kênh liên hệ, pháp lý vào đoạn kiến thức để AI trả lời được "shop ở đâu, mấy giờ mở, Zalo gì"; readiness tính thêm các trường mới. Không log số điện thoại. Làm sau khi PR3 được merge.
>
> PR5 `feat/kb-shop-suggest`: (a) Shopify: thêm name, contactEmail, primaryDomain, billingAddress, description nếu có; tra scope bằng tài liệu shopify.dev; thiếu scope thì bỏ qua và báo `missing_scopes` như hiện có, ghi scope cần thêm vào `docs/can-ban-cung-cap.d/` → ghi suggestions status draft khi đồng bộ, không ghi đè giá trị Owner đã nhập. (b) Văn bản thô: mở rộng máy chắt lọc M3-2 với kind `shop_field` cho name/slogan/description/address/hours/legal… (evidence_quote nguyên văn, kiểm chữ số trong trích dẫn như hiện có); hotline/email/website/zalo/shopee/tiktok tách bằng regex của CODE trên văn bản gốc chưa che (không gửi LLM); chi phí nằm trong trần 0,20 USD/sync. (c) Giao diện: dưới mỗi trường hiện "Đề xuất từ Shopify / từ đoạn <tiêu đề>" kèm trích dẫn, nút Áp dụng và Bỏ; Áp dụng ghi vào trường và đánh dấu applied; chỉ Owner. Đo hồi quy: EVAL demo 1 lượt, cờ tắt, < 1 USD, ghi sổ `eval-spend-ledger`. Tự merge nếu đạt; không đạt báo mẫu lệch.
>
> [CẦN LÀM RÕ] tự quyết và ghi `docs/plans/quyet-dinh/q-kb-shop-v2.md`: cách hiển thị ngày trong tuần của giờ mở cửa; giới hạn số chi nhánh (đề xuất 10).
>
> QUY TẮC CHUNG: một kế hoạch docs/ cho mỗi PR; báo cáo ≤ 10 dòng khi xong; cập nhật `docs/codemap.d`, `docs/gap-matrix.md`, `docs/handoff/<nhánh>.md`. Giữ nguyên cấm: không đọc `.env*`, không bật cờ ngoài Phần 2, không migration ngoài cf_dev/cf_test, EVAL chuỗi 2 ≤ 10 USD (đã dùng ≈ 1,04). Diff thuộc diện DỪNG (migration/RLS/trigger/auth/cổng tự gửi/che PII): tự kiểm theo `docs/workflows/verify.md`, gắn nhãn "tự kiểm", mở PR, KHÔNG tự merge, làm tiếp việc không phụ thuộc.

## Điểm chưa chốt

Hai điểm `[CẦN LÀM RÕ]` đã được chủ dự án cho phép tự quyết: ngày trong tuần của giờ mở cửa và số chi nhánh tối đa — ghi ở `docs/plans/quyet-dinh/q-kb-shop-v2.md` (chọn: ngày dạng danh sách chọn T2–CN lưu thành mảng số 1–7; tối đa 10 chi nhánh).

## Tiêu chí nghiệm thu

1. PR1: 10 ảnh Stitch được theo dõi, README có hàng cho từng màn. 
2. PR2: `/app/kb/shop` khớp `kb-shop.png` (ảnh trước/sau, `pnpm ui:fidelity`); khối ngoài phạm vi là nút tắt kèm chú thích, không số mẫu.
3. PR3: migration chỉ-thêm, RLS đúng, hệ thống chỉ chèn `draft`, ràng buộc ≤ 500 ký tự và ≤ 10 chi nhánh, Zod trong `packages/shared`.
4. PR4: AI trả lời được địa chỉ/giờ/Zalo từ đoạn `sync:shop`; readiness tính trường mới; không log SĐT.
5. PR5: đề xuất từ Shopify và văn bản thô hiện dưới từng trường; Áp dụng/Bỏ chỉ Owner; EVAL demo 1 lượt (cờ tắt) không thấp hơn cơ sở; chi phí ≤ trần.

## File sẽ đọc / sửa

PR1: `design/stitch/*`. PR2: `apps/web/src/app/app/(guarded)/kb/shop/`, `components/kb/`, i18n `vi.json`/`en.json`. PR3: `packages/db/migrations/`, `packages/db/src/schema/cf/kb-content.ts`, `packages/shared`. PR4–5: `apps/web` server actions, `packages/ai/src/kb-sync`, `kb-distill`, `packages/ai/src/shopify`, `packages/db/src/queries`.

## Migration

Chỉ PR3 (chỉ-thêm, có đường lùi trong chú thích) — DỪNG chờ chủ dự án.

## Test viết trước

Có theo từng PR (logic quy tắc: viết test trước).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web test`, `pnpm --filter @flow/db test:db`, `pnpm --filter @flow/ai exec vitest run src/kb-sync src/kb-distill`, `pnpm ui:fidelity kb-shop /app/kb/shop`.

## Cần kiểm chứng độc lập không?

PR3 (migration/RLS/trigger) và mọi diff chạm RLS/PII: tự kiểm theo `docs/workflows/verify.md` ("tự kiểm"), KHÔNG tự merge. PR1, PR2, PR4, PR5: tự merge khi CI xanh (PR4 chỉ sau khi PR3 vào main).

## Rủi ro / câu hỏi cho chủ dự án

Ảnh `kb-shop.png` không có bản mobile/HTML: bản 390 px tự co bằng Tailwind. Số liệu trong ảnh là dữ liệu mẫu, không đưa vào sản phẩm.
