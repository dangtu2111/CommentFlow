# Kế hoạch `feat-admin-plans-coupons` — ADMIN-REST phần dữ liệu (FR-104)

## Việc

Mã gap matrix: `ADMIN-REST` (phần dữ liệu) · Spec: FR-104, `docs/13` §3.2 (quyền Admin), `docs/11` §14, `docs/10` §3.6 (`plans`), Q-PLN1 (0054).

**Tóm tắt:** Thêm phần dữ liệu để Admin quản gói cước (sửa giá/hạn mức/bật tắt) và mã giảm giá (tạo, bật/tắt, hạn dùng, trần lượt), cùng đường Owner áp mã có kiểm hạn dùng và giới hạn lượt. Không thanh toán thật, không giao diện. Rủi ro: có migration 0060 và hàm DB đặc quyền (DEFINER) → cần verifier-db + verifier-security một lần; đổi hạn mức gói đổi hạn mức của mọi workspace đang dùng gói đó.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn, ghi Q-ADP1).

## Tiêu chí nghiệm thu

1. `canManagePlansCoupons` chỉ Super; `canViewCoupons` Super + Finance; vai trò lạ/không-admin → false — `pnpm --filter @flow/shared exec vitest run src/coupon.test.ts`.
2. `evaluateCoupon`: hạn dùng (bắt đầu gồm, kết thúc loại), tắt, trần tổng, trần mỗi workspace, sản phẩm/gói áp dụng, chỉ gói `base`; số tiền giảm làm tròn xuống, không vượt giá; dữ liệu hỏng → từ chối — cùng test.
3. `parseCouponInput`/`parsePlanUpdate` từ chối đầu vào sai (phần trăm 0/101, hạn trước ngày bắt đầu, giá âm/quá trần…) — cùng test.
4. `core.coupons`: RLS bật, `cf_app`/`cf_worker` không đọc/ghi trực tiếp (42501); `core.coupon_redemptions`: thành viên chỉ đọc lượt của workspace mình — `pnpm test:db` (`packages/db/tests/admin-billing.int.test.ts`).
5. Sửa gói/tạo/sửa mã chỉ Super; xem mã Super + Finance; Support/Owner/không user/ngữ cảnh workspace/hệ thống → 42501 — cùng test tích hợp.
6. `apply_coupon`: chỉ Owner đúng workspace; Staff/chéo workspace/hệ thống/Admin → 42501; trần tổng không bị vượt khi 5 yêu cầu song song; trần mỗi workspace; mã hết hạn/chưa bắt đầu/tắt/sai gói bị từ chối; mức giảm khớp `evaluateCoupon` — cùng test tích hợp.
7. `check-rls` (test `check-rls.int.test.ts` trong `test:db` + `check-rls.test.ts`) xanh với bảng/hàm mới.
8. Công cụ: `lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `test:trace`, `--filter @flow/shared test:coverage`, `check:migrations` xanh.

## File sẽ đọc

`packages/db/migrations/0054_plans_subscriptions.sql`, `0059_integration_health.sql` (mẫu DEFINER Admin), `packages/db/src/schema/core/billing.ts`, `packages/db/src/check-rls.ts` (+ test), `packages/db/tests/integration-health.int.test.ts` (mẫu), `packages/shared/src/plan.ts`, `docs/13` §3.2.

## File sẽ sửa / tạo

- Tạo `packages/shared/src/coupon.{ts,test.ts}` + export trong `packages/shared/src/index.ts`.
- Sửa `packages/db/src/schema/core/billing.ts` (bảng `coupons`, `coupon_redemptions`); tạo `packages/db/src/queries/admin-billing.ts` (+ export `runtime.ts`), `packages/db/tests/admin-billing.int.test.ts`.
- Migration `packages/db/migrations/0060_admin_plans_coupons.sql` (+ journal/snapshot do drizzle-kit).
- Sửa `packages/db/src/check-rls.ts` + `check-rls.test.ts`.
- Docs file riêng: `docs/plans/quyet-dinh/q-adp1.md`, `docs/codemap.d/cay-packages-{db-src-queries-admin-billing-ts,shared-src-coupon-ts}.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-adp.md`; dòng MASTER; `docs/handoff/feat-admin-plans-coupons.md`.

## Migration

0060: bảng `core.coupons` (RLS bật, không policy, không quyền cho web/worker), `core.coupon_redemptions` (RLS theo workspace, chỉ SELECT cho thành viên); hàm DEFINER `core.assert_billing_admin`, `admin_update_plan`, `admin_create_coupon`, `admin_update_coupon`, `admin_list_coupons`, `apply_coupon` (EXECUTE chỉ `cf_app`; vai trò kiểm trong thân hàm). Đường lùi ghi đầu phần SQL tay của migration.

## Test viết trước

Logic thuần (1–3) có test viết cùng lúc với mã; RLS/hàm DB (4–7) bằng test tích hợp trên `cf_test`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/coupon.test.ts` · `pnpm test:db` (làn b).

## Cần kiểm chứng độc lập không?

Có — migration + hàm DEFINER + phân quyền Admin/Owner + tiền: `verifier-db` và `verifier-security`, mỗi bên một lần.

## Rủi ro / câu hỏi cho chủ dự án

- Đổi giá/hạn mức gói tác động ngay lên workspace đang dùng gói (hạn mức đọc từ `core.plans`).
- Chưa nhật ký admin cho thay đổi gói/mã (gap `ADMIN-AUDIT`); chưa rate-limit dò mã (`COUPON-RATELIMIT-WIRE`); chưa nối checkout/hóa đơn (`COUPON-CHECKOUT-WIRE`); chưa giao diện/route (`ADMIN-REST-UI`). Lượt áp mã hiện bị tiêu ngay khi áp, dù chưa thanh toán.
- Hàm DEFINER tin `app.user_id` do web đặt (giới hạn ADR 005 §3), như `cf.assert_super_admin` của 0059.

## Đề xuất thay đổi

Không đổi docs/01–16.

## Complexity tracking

Hàm DEFINER chéo workspace và bảng mã không cho `cf_app` đọc: đi ngoài `withWorkspace` (nguyên tắc #2) vì mã và gói là dữ liệu hệ thống, không thuộc workspace; phương án đơn giản hơn (SELECT trực tiếp) bị loại vì lộ mọi mã.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — `coupons`: không policy, chỉ hàm DEFINER; `coupon_redemptions`: chỉ SELECT thành viên, ghi chỉ qua `apply_coupon` (Owner)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR; lựa chọn riêng ghi Q-ADP1).
