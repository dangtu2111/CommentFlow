# Kế hoạch `fix/kb-shop-ui-html` — đối chiếu trang Thông tin cửa hàng với HTML Stitch

## Việc

Mã gap matrix: `KB-SHOP-V2` (sửa PR2). Lệnh chủ dự án 11/11/2026: dựng theo HTML Stitch, không theo ảnh (ADR 013, Q-UIF1).

**Tóm tắt (2–3 câu dễ hiểu):** Chép lại class Tailwind của các khối trong `design/stitch/kb-shop.html` (thanh tiêu đề khối có nền, ô tròn biểu tượng, lưới 12 cột, hộp ghi chú AI, banner hồ sơ gốc…) vào `shop-sections.tsx`, đo bằng `pnpm ui:fidelity kb-shop //app/kb/shop`, và chụp ảnh "trước" từ TRANG THẬT đã đăng nhập. Công cụ đo được mở rộng để mở trang `/app/...` qua `/dev/login` (chỉ dev, Owner mẫu `[MẪU]`). Không logic mới, không migration.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Ảnh trước/sau là trang thật (`docs/plans/ui-fidelity/kb-shop/truoc-*.png`, `sau-*.png`, 1440 + 390), không tràn ngang.
2. Báo cáo `fidelity-truoc.md` / `fidelity-sau.md`; lệch hình học giảm (20 → 18/55 chỉ số) và danh sách lệch còn lại có giải thích bên dưới.
3. `pnpm lint:i18n`, typecheck, test web xanh.

## File sẽ đọc / sửa

Sửa: `apps/web/src/components/kb/shop-sections.tsx`, `apps/web/src/app/app/(guarded)/kb/shop/page.tsx`, i18n `vi/en`, `e2e/support/ui-completeness.mjs` (mở trang `/app/` qua `/dev/login`).

## Migration

Không.

## Test viết trước

Không áp dụng cho trình bày thuần (hành vi lưu giữ nguyên).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web typecheck && pnpm lint:i18n && pnpm --filter @flow/web test`; `pnpm ui:fidelity kb-shop //app/kb/shop --base http://localhost:3000`.

## Cần kiểm chứng độc lập không?

Không (không chạm RLS/auth/guard).

## Kết quả đo và điểm lệch còn lại (giải thích)

- Chữ khớp 10,3% → 12,0% và hình học lệch 20 → 18/55: phần lớn điểm lệch KHÔNG thuộc nội dung tab này mà thuộc hai thành phần dùng chung: (1) **khung ứng dụng** (header/thanh bên: padding, chiều cao) — dựng ở `feat/app-shell`, lệch do HTML Stitch đặt thanh bên `fixed` còn app dùng bố cục luồng; (2) **khung KB** (`KbFrame`: tiêu đề "Cơ sở kiến thức AI", huy hiệu bản nháp/đã xuất bản, thanh "Độ đầy đủ dữ liệu", dải tab, khối đối tượng áp dụng) — dùng chung cho mọi tab KB nên sửa MỘT lần cùng màn đầu tiên của Phần 4a, không sửa riêng ở trang này.
- Phần chữ còn "thiếu" là DỮ LIỆU MẪU của Stitch (tên shop, chi nhánh, số tài khoản, số liệu readiness…) và tính năng chưa có (Google Maps, VietQR/SePay, AI trực ca đêm): không đưa vào sản phẩm.
- "Không đăng nhập được" KHÔNG xảy ra: đăng nhập bằng mật khẩu đòi 2FA (Owner mẫu đã bật 2FA) nên dùng `/dev/login` (phiên thật của Owner mẫu, cổng 2FA không bị nới).

## Rủi ro / câu hỏi cho chủ dự án

Ảnh "trước" chụp lúc `pnpm dev:seed-demo --reset` vừa tạo lại workspace mẫu (mật khẩu tài khoản mẫu bị đổi; không ảnh hưởng dữ liệu thật).
