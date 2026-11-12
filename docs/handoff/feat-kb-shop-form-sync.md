# Bàn giao `feat/kb-shop-form-sync` (Claude Code)

## Đã làm
- `upsertShopProfile(tx, ws, input, v2?)`: có `v2` thì ghi các cột mới; không có thì giữ nguyên. `listShopProfiles` trả trường mới (JSON qua Zod, hỏng thì rơi về rỗng).
- `loadReadinessSource`: thêm cờ `hasStructuredHours/hasContactChannel/hasBranchAddress` (không trả giá trị).
- `buildShopDocuments`: thêm dòng khẩu hiệu, ngành, pháp lý, lịch mở cửa, giờ hỗ trợ, hotline/Zalo/website/Shopee/TikTok, chi nhánh (chính trước).
- `formToShopProfileV2` + `saveShopProfileAction`; `shop-sections.tsx` bật ô thật (còn tắt: logo, ngân hàng, AI ca đêm, Google Maps).
- Sửa luôn E2E tổng quan KB (do #334: "Từ điển viết tắt" không còn là mục Sắp có).

## File đã đọc + điều rút ra
- Cột v2 và RLS có từ migration 0085; hotline/website vẫn ở cột cũ `contact`/`website`.
- `pnpm e2e` dùng `cf_test`; 4 test Thử AI + Shopify lỗi cục bộ cả trên `main` (chưa rõ nguyên nhân).

## Việc còn lại
- PR5 `feat/kb-shop-suggest` (đề xuất từ Shopify/văn bản thô, Áp dụng/Bỏ).
- Chụp lại `ui:fidelity kb-shop`.
- Dọn dữ liệu thừa của test tích hợp trong `cf_test` (key_version > 1 làm web E2E không khởi động).
