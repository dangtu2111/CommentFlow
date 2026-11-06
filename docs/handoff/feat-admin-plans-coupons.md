# Handoff `feat-admin-plans-coupons` (ADMIN-REST phần dữ liệu, FR-104) — Claude Code, làn b

## Đã làm
- Lõi thuần `packages/shared/src/coupon.ts` (+test): quyền (Super sửa; Super+Finance xem), chuẩn hóa/kiểm đầu vào mã/gói/sửa mã, `evaluateCoupon` (hạn dùng, trần lượt, gói áp dụng, số tiền giảm).
- Migration 0060: `core.coupons` (RLS bật không policy, cf_app không quyền), `core.coupon_redemptions` (RLS, Owner đọc), 6 hàm DEFINER (`assert_billing_admin`, `admin_update_plan`, `admin_create_coupon`, `admin_update_coupon`, `admin_list_coupons`, `apply_coupon`).
- `packages/db/src/queries/admin-billing.ts` (export ở `runtime.ts`), `tests/admin-billing.int.test.ts` (gồm test song song tranh trần lượt), kỳ vọng ở `check-rls.ts` (+test).
- Q-ADP1, KT-ADP, codemap, docs/10 §3.6.

## Điều rút ra
- check-rls coi bảng không `workspace_id` là "unknown" → thêm nhóm `ADMIN_ONLY_TABLES`.
- cf_worker là thành viên cf_app nên thừa kế EXECUTE; chặn bằng `session_user = 'cf_worker'` trong thân hàm.
- Đã sửa theo verifier: Owner (không phải Staff) đọc lượt dùng; từ chối gói 0 đồng; `updateCoupon` qua Zod; hạn/ghi chú sai → 22023; `lock_timeout`.

## Còn lại (gap)
`ADMIN-REST-UI` (trang + route kiểm phiên Admin và `canManagePlansCoupons`/`canViewCoupons` trước `withUser`), `ADMIN-AUDIT` (nhật ký thay đổi gói/mã), `COUPON-CHECKOUT-WIRE` (lượt hiện bị tiêu ngay khi áp: cần trạng thái chờ/hoàn lượt khi hóa đơn hủy, hàm xem trước không tiêu lượt), `COUPON-RATELIMIT-WIRE` (chống dò mã; trả lý do chung cho web; cân nhắc mã tối thiểu 6 ký tự), tuỳ chọn: CHECK `redemption_count <= max_redemptions`, chặn tắt gói trial duy nhất. Nội dung hệ thống và quản trị viên của ADMIN-REST chưa làm. Chưa có route nào gọi `apply_coupon` (đường thật mặc định tắt).
