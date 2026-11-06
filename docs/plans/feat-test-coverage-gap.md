# Kế hoạch `feat-test-coverage-gap` — nâng coverage `saas-core` (ratchet)

## Việc

Mã gap matrix: `TEST-COVERAGE-GAP` · Spec: `docs/testing/STANDARD.md` §8.

**Tóm tắt:** Thêm test đơn vị (dùng DB/Redis/Auth giả, không cần máy phụ) cho các file `saas-core` đang chưa được phủ: `tenancy`, `pg-errors`, `action-log`, `session`, `revoke`, `valkey`, các nhánh kiểm đầu vào/quyền của `workspace-admin`. Sau đó nâng ngưỡng CI lên mức đo mới (chỉ tăng). Không sửa mã sản phẩm; rủi ro thấp.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Coverage đơn vị `saas-core` ≥ 63% dòng, 53% nhánh, và ngưỡng trong `packages/saas-core/vitest.config.ts` được nâng đúng bằng mức đo (làm tròn xuống) — kiểm bằng `pnpm --filter @flow/saas-core test:coverage`.
2. Test mới kiểm hành vi thật (từ chối đầu vào sai, FORBIDDEN/NOT_FOUND, RLS→FORBIDDEN, phiên Admin quá 8 giờ bị xóa, đổi mật khẩu rồi thu hồi mọi phiên) — kiểm bằng `pnpm --filter @flow/saas-core test`.
3. Không file mã sản phẩm nào đổi; bảng ngưỡng ở `STANDARD.md` §8 và gap matrix khớp config — kiểm bằng `git diff --stat`.

## File sẽ đọc

`tenancy/tenancy.ts`, `workspace-admin.ts` (một phần), `pg-errors.ts`, `action-log.ts`, `auth/session.ts`, `auth/revoke.ts`, `auth/auth-db.ts`, `ratelimit/valkey.ts`.

## File sẽ sửa / tạo

Test mới trong `packages/saas-core/src/{tenancy,auth,ratelimit}/*.test.ts`; `packages/saas-core/vitest.config.ts` (ngưỡng); `docs/testing/STANDARD.md` §8; `docs/gap-matrix.md`; `docs/plans/MASTER.md`; `docs/handoff/feat-test-coverage-gap.md`.

## Migration

Không có.

## Test viết trước

Chính việc này là viết test; test chạy trên mã đã có (đặc tả hành vi hiện tại).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/saas-core test:coverage`

## Cần kiểm chứng độc lập không?

Không (chỉ thêm test, không đổi mã sản phẩm).

## Rủi ro / câu hỏi cho chủ dự án

Còn thiếu để tới 85%: `auth/flows`, `auth/two-factor`, `auth/auth`, phần lớn `workspace-admin` (cần DB giả phức tạp hoặc gộp coverage test tích hợp). Việc tiếp theo, ratchet tiếp.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

**Trạng thái duyệt:** Đã duyệt (tự duyệt — không có quyết định mới, chỉ thêm test).
