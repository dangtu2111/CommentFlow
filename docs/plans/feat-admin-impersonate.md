# Kế hoạch `feat-admin-impersonate` — ADMIN-IMPERSONATE (FR-105)

## Việc

Mã gap matrix: `ADMIN-IMPERSONATE` · Spec: FR-105, US-082, `docs/09` (`admin-kit`, bảng `admin_impersonations`).

**Tóm tắt:** Quản trị nền tảng (Super/Support) có thể "xem như khách" để gỡ lỗi: bắt buộc nhập lý do, chỉ đọc, tự hết hạn sau tối đa 30 phút, mọi lần dùng đều ghi nhật ký kiểm toán, mọi thao tác ghi bị chặn. Làn này chỉ làm logic thuần + guard + interface lưu trữ/nhật ký (có bản bộ nhớ để test). Rủi ro: leo quyền/đọc dữ liệu khách → cần kiểm chứng `verifier-security` một lần. Bảng DB và giao diện làm sau.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn, ghi Q-AIMP1).

## Tiêu chí nghiệm thu

1. Không có lý do (rỗng/< 10 ký tự sau cắt khoảng trắng) hoặc không phải Super/Support → không tạo phiên, không ghi nhật ký — kiểm bằng `impersonation.test.ts`, `impersonation-service.test.ts`.
2. Phiên hết hạn đúng ≤ 30 phút; yêu cầu xin dài hơn bị kẹp; phiên bị sửa sống > 30 phút bị coi `invalid` — kiểm bằng test + property-based.
3. Chỉ GET/HEAD qua guard; POST/PUT/PATCH/DELETE/phương thức lạ bị chặn `read_only` — kiểm bằng test + property-based.
4. Mọi lần dùng (start/access/blocked/end) ghi nhật ký; nhật ký lỗi → không tạo phiên / không cho xem; đường dẫn ghi nhật ký bỏ query (không PII) — kiểm bằng `impersonation-service.test.ts`.
5. Sai admin/sai workspace/đã kết thúc/hết hạn → chặn — kiểm bằng test.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/db/src/schema/core/platform.ts` (cột `impersonation_id`), `packages/ai/src/send-lock/send-lock.ts` + `send-lock-service.ts` (mẫu vai trò Admin + store/effects), `packages/saas-core/src/tenancy/action-log.ts`, `docs/09` mục admin-kit.

## File sẽ sửa / tạo

- `packages/saas-core/src/admin/impersonation.ts` — logic thuần (quyền, kiểm lệnh, trạng thái phiên, guard chỉ-đọc)
- `packages/saas-core/src/admin/impersonation-service.ts` — service + interface `ImpersonationStore`/`ImpersonationAudit` + bản bộ nhớ
- `packages/saas-core/src/admin/index.ts`, `src/index.ts` — export
- 2 file test cùng thư mục; docs: Q-AIMP1, codemap.d, gap-matrix, MASTER, handoff

## Migration

Không có (chỉ làn b). Phần cần bảng `admin_impersonations` + đường INSERT `action_logs` cho Admin → gap `ADMIN-IMPERSONATE-WIRE`.

## Test viết trước

Cả hai file test viết trước code (TDD, có property-based bằng fast-check).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/saas-core exec vitest run src/admin` · `pnpm --filter @flow/saas-core test:coverage`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (quyền admin, phiên, guard ghi, nhật ký).

## Rủi ro / câu hỏi cho chủ dự án

Khi nối vào web, middleware PHẢI gọi `service.access` trước mọi handler và thao tác ghi phải bị chặn cả ở tầng DB (kết nối chỉ-đọc) — ghi ở gap WIRE.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có. (Interface store/audit có 2 nơi dùng: bản bộ nhớ và bản DB sau này — theo mẫu send-lock.)

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec hoặc ghi Q-AIMP1).
