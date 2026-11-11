# Kế hoạch `feat/kb-shop-ui` — dựng lại trang "Thông tin cửa hàng" theo Stitch (UI-first)

## Việc

Mã gap matrix: `KB-SHOP-V2` (PR2/5). Kế hoạch chung: `docs/plans/feat-kb-shop-v2.md` (Q-UIF1, ADR 013).

**Tóm tắt (2–3 câu dễ hiểu):** Dựng lại `/app/kb/shop` thành 5 khối như `design/stitch/kb-shop.png` (nhận diện, địa chỉ & chi nhánh, giờ làm việc, kênh liên hệ, pháp lý), bằng Tailwind, tự co ở 390 px. Chỉ 6 cột dữ liệu hiện có (tên, mô tả, địa chỉ, giờ mở cửa, liên hệ, website) là ô nhập thật; khối chưa có nền tảng (khẩu hiệu, ngành, chi nhánh, giờ trực, Zalo/Shopee/TikTok, pháp lý, ngân hàng/VietQR, AI trực ca đêm, Google Maps, logo) là ô/nút tắt kèm chú thích, không số mẫu. Không logic mới, không migration.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Trang có 5 khối theo thiết kế; 6 ô thật vẫn lưu qua `saveShopProfileAction` như cũ.
2. Khối ngoài phạm vi là ô/nút `disabled` kèm chú thích, không hiện số mẫu.
3. Không tràn ngang ở 1440 và 390 (ảnh sau: `docs/plans/ui-fidelity/kb-shop/sau-1440.png`, `sau-390.png`, chụp từ `/dev/ui/kb-shop`).
4. `pnpm lint:i18n`, typecheck, test web xanh.

## File sẽ đọc / sửa

Sửa: `apps/web/src/app/app/(guarded)/kb/shop/page.tsx`, `packages/shared/src/i18n/messages/{vi,en}.json`. Thêm: `apps/web/src/components/kb/shop-sections.tsx`, `apps/web/src/app/dev/ui/kb-shop/page.tsx`, ảnh sau.

## Migration

Không.

## Test viết trước

Không áp dụng cho trình bày thuần; hành vi lưu giữ nguyên (test hiện có của `saveShopProfileAction`).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web typecheck && pnpm lint:i18n && pnpm --filter @flow/web test`.

## Cần kiểm chứng độc lập không?

Không (không chạm RLS/auth/guard). Tự merge khi CI xanh.

## Rủi ro / câu hỏi cho chủ dự án

- `kb-shop.png` không có `.html` nên `pnpm ui:fidelity` (đo hình học theo HTML Stitch) không chạy được; đối chiếu bằng ảnh. Ảnh "trước" của trang thật không chụp được (cần đăng nhập) — thay bằng ảnh thiết kế.
- Thanh readiness "Độ đầy đủ dữ liệu thương hiệu" và khung ứng dụng (header/tab) thuộc màn Tổng quan/khung KB, không làm ở PR này (không số mẫu).
