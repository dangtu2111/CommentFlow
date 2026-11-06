# Bàn giao feat-ui-auth (claude)

**Đã làm:** giao diện /login, /register khớp Stitch (panel + thẻ [MẪU] + nút Facebook tắt + đường kẻ); sửa lỗi khóa i18n `activity.actions` làm vỡ mọi trang dev; ảnh trước/sau ở `docs/plans/ui-fidelity/ui-auth/{truoc,sau}`.

**Điều rút ra:** web chạy ở dev cần biến môi trường — dùng `node e2e/support/dev-ui.mjs <cổng>` (biến giả, không DB); chụp: `node e2e/support/shot-auth.mjs <thư-mục> http://localhost:<cổng>`. Trang cần DB (đã đăng nhập) chưa chụp được.

**Còn lại:** trang nhận lời mời (khớp phần được phép), thư email (saas-core/notify), các màn thiếu thiết kế (`docs/plans/ui-thieu-thiet-ke.md`), liên kết Điều khoản/Chính sách khi có trang, ghi nhớ đăng nhập.
