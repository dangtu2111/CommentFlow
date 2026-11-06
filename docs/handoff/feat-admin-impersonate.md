# Bàn giao — nhánh `feat-admin-impersonate`

Cập nhật: 2026-11-06 · Mục gap matrix: ADMIN-IMPERSONATE · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-admin-impersonate.md`

## Đã làm
- `packages/saas-core/src/admin/impersonation.ts` (thuần) + `impersonation-service.ts` (store/audit interface, bản bộ nhớ) + test TDD/property-based. Quyết định: Q-AIMP1.
- Docs: plan, Q-AIMP1, codemap.d, gap `ADMIN-IMPERSONATE-WIRE`, MASTER.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `packages/db/.../platform.ts` | `action_logs` có `actor_type='admin'` và `impersonation_id` (không FK); chưa có bảng `admin_impersonations` |
| `packages/ai/src/send-lock/*` | Mẫu vai trò Admin (`super/support/finance`) và store/effects interface |

## Còn lại
- Migration bảng `admin_impersonations` (làn b), middleware web gọi `service.access`, kết nối DB chỉ-đọc, giao diện, bản `ImpersonationAudit` ghi `action_logs`.
