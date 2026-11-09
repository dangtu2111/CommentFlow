# Kế hoạch `feat/kb-policies-actions` — Nối nút Duyệt / Bỏ của trang Chính sách có cấu trúc (PR B1)

## Việc

Mã gap matrix: `KB-POLICIES-STRUCTURED-UI` · ADR 017 · tiếp nối PR A (`feat/kb-policies-structured`, #302). Sửa tay / Thêm giá trị (biểu mẫu từng loại) làm ở PR B2.

**Tóm tắt (2–3 câu dễ hiểu):** Owner bấm Duyệt hoặc Bỏ trên từng giá trị nháp. Duyệt kèm phiên bản (`rev`) đang xem và, với đề xuất còn điều kiện chưa tách được, phải tick xác nhận; lệch phiên bản thì báo "có người vừa cập nhật" và không ghi. Rủi ro: ghi dữ liệu mà AI dùng để trả lời khách, nên chỉ Owner, qua `withActor` (RLS và trigger vẫn là hàng rào thật), không đổi quyền hay migration.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `discardPolicyDraft`: đúng `rev` → xóa nháp; lệch `rev` → `stale` và giữ nguyên; không có → `not_found`; KHÔNG bao giờ xóa bản đã duyệt; Staff không bỏ được — kiểm bằng: `packages/db/tests/policy-facts.int.test.ts` (nhóm "discardPolicyDraft").
2. Server Action Duyệt/Bỏ: chỉ Owner (`requireAppUser({role:'owner'})`), workspace/người dùng lấy từ phiên, form sai → `invalid`, chặn bấm đúp (`rate_limited`), lỗi bất ngờ → `unavailable` không lộ chi tiết, kết quả `approved/stale/needs_review/not_found/discarded` → `?pn=` đúng — kiểm bằng: `kb/policy-actions.test.ts`.
3. Form: `id`/`rev` ẩn, ô tick xác nhận BẮT BUỘC khi đề xuất cần xác nhận điều kiện; Staff không có form; thông báo đúng vai trò (status/alert) — kiểm bằng: `components/kb/policy-facts-panel.test.tsx`, `lib/kb-policy-notice.test.ts`.
4. Tự kiểm theo `docs/workflows/verify.md` (ghi quyền, RLS): không đổi migration/RLS/trigger; mọi ghi qua hàm DB đã có kiểm Zod ở ranh giới; không log nội dung — kiểm bằng: đọc diff cuối nhánh (nhãn "tự kiểm, chưa có kiểm chứng độc lập").

## File sẽ đọc

`packages/db/src/queries/policy-facts.ts`, `apps/web/src/app/app/(guarded)/kb/actions.ts` (mẫu Server Action), `apps/web/src/server/action-guard.ts`.

## File sẽ sửa / tạo

Tạo: `apps/web/src/app/app/(guarded)/kb/policy-actions.ts` (+ test), `apps/web/src/lib/kb-policy-notice.ts` (+ test). Sửa: `packages/db/src/queries/policy-facts.ts` (`discardPolicyDraft`), `packages/db/src/runtime.ts`, `packages/db/tests/policy-facts.int.test.ts`, `components/kb/policy-facts-panel.tsx` (+ test), `kb/policies/page.tsx`, `packages/shared/src/i18n/messages/{vi,en}.json`.

## Migration

Không.

## Test viết trước

Test viết cùng mã (xem tiêu chí).

## Lệnh test phạm vi hẹp

`cd packages/db && pnpm exec vitest run --config vitest.int.config.ts tests/policy-facts.int.test.ts`; `pnpm --filter @flow/web exec vitest run src/lib/kb-policy-notice.test.ts "src/app/app/(guarded)/kb/policy-actions.test.ts" src/components/kb`
