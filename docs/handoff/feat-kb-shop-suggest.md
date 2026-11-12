# Bàn giao `feat/kb-shop-suggest` (Claude Code)

## Đã làm
- `@flow/shared`: `extractContactSuggestions` (regex hotline/email/website/Zalo/Shopee/TikTok, bỏ mã số thuế), `shopifyShopToSuggestions`, `mergeContactText`.
- `@flow/db`: `listDraftShopSuggestions`, `replaceShopSuggestionDrafts(ForProfiles)`, `decideShopSuggestion` (Owner Áp dụng/Bỏ; không đề xuất lại giá trị đã quyết hoặc trùng hồ sơ).
- Shopify: `connector.fetchShop` + bước `syncShopSuggestions` trong job (lỗi/thiếu quyền không làm hỏng việc nạp).
- Chắt lọc: loại `shop_field` (prompt `distill@2`), liên hệ tách bằng regex trong `runKbDistill` (`ops.saveShopSuggestions`).
- Web: `shop-suggestion-actions.ts`, đề xuất dưới từng ô ở `shop-sections.tsx`, form Áp dụng/Bỏ ngoài form chính (nút gắn bằng thuộc tính `form`), thông báo applied/rejected/no_profile/too_long.

## File đã đọc + điều rút ra
- Bảng `shop_profile_suggestions`: mỗi (workspace, lang, field, source) tối đa một nháp; trigger đóng dấu người quyết; hệ thống chỉ chèn `draft`.
- Cột `email` không có trong hồ sơ → hotline/email nối vào ô "Liên hệ công khai"; Zalo/Shopee/TikTok vào `contacts`.
- Tài liệu Shopify không nêu quyền từng trường `shop`; chưa kiểm cửa hàng thật (`docs/can-ban-cung-cap.d/kb-shop-shopify-scope.md`).

## Việc còn lại
- Đo lại chất lượng chắt lọc `distill@2` trên Shop Thử 2 (M3) trước khi bật `cf.ai.distill` rộng.
- Chụp lại `ui:fidelity kb-shop`; E2E cho Áp dụng/Bỏ cần cách gieo đề xuất qua DB (E2E chưa có helper DB).
- Tiếp: kb-catalog, kb-rules, Phần 4b–e.
