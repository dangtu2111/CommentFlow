# Kế hoạch `feat/policy-owner-edit` — Owner sửa tay nháp chính sách, đồng bộ không ghi đè (POLICY-DRAFT-OWNER-EDIT)

## Việc

Mã gap matrix: `POLICY-DRAFT-OWNER-EDIT` · ADR 017 · bắt buộc xong trước màn "Chính sách có cấu trúc" (PR 4).

**Tóm tắt (2–3 câu dễ hiểu):** Khi Owner sửa tay một bản NHÁP chính sách do máy đề xuất (điều kiện, phạm vi, số liệu), lần đồng bộ Shopify/văn bản sau không được ghi đè hay xóa bản đã sửa. Dấu "đã qua tay Owner" dùng cột `origin` sẵn có (`manual`), nên không cần migration, RLS hay trigger mới. Rủi ro: thấp, chỉ thêm một hàm ghi cho Owner và một điều kiện bỏ qua trong lúc đồng bộ.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `editPolicyDraft`: sửa nháp của máy → thay bằng nháp `origin = 'manual'` cùng (kind, slot), giữ evidence/source_ref; nháp đã `manual` cập nhật tại chỗ — kiểm bằng: `policy-facts.int.test.ts` (nhóm "POLICY-DRAFT-OWNER-EDIT").
2. Đồng bộ sau (đổi nội dung đề xuất hoặc không còn đề xuất) KHÔNG ghi đè và KHÔNG xóa nháp `manual` — cùng test.
3. Kèm `rev`: lệch → `stale`; không tồn tại → `not_found`; dữ liệu sai Zod → lỗi, không ghi; Staff không sửa được (`not_found`, nháp không đổi) — cùng test.
4. Nháp `manual` vẫn duyệt được bằng `approvePolicyFact` — cùng test.

## File sẽ đọc

`packages/db/src/queries/policy-facts.ts`, `packages/db/migrations/0083_policy_facts.sql` (RLS/trigger: `origin` bất biến, hệ thống không ghi `manual`), `packages/db/tests/policy-facts.int.test.ts`.

## File sẽ sửa / tạo

Sửa: `packages/db/src/queries/policy-facts.ts` (`editPolicyDraft`, `refreshPolicySuggestions` bỏ qua slot đã `manual`), `packages/db/src/runtime.ts` (export), `packages/db/tests/policy-facts.int.test.ts`, `docs/gap-matrix.md`.

## Lưu ý cho UI (màn "Chính sách có cấu trúc", PR 4)

- **Id đổi sau khi lưu:** sửa nháp của máy sẽ XÓA dòng cũ và TẠO dòng mới (id đổi, `rev` về 1). Màn hình phải TẢI LẠI danh sách sau khi lưu, không giữ id/rev cũ (duyệt kèm id cũ sẽ ra `not_found`).
- **Nhãn "đã sửa tay":** nháp `manual` giữ `evidence` của máy (câu trích từ văn bản gốc). Màn hình gắn nhãn "đã sửa tay" (theo `origin = 'manual'`) cạnh trích dẫn nguồn, để Owner biết số liệu không còn đúng nguyên văn trích dẫn.

## Migration

Không.

## Test viết trước

Test tích hợp viết cùng mã (xem tiêu chí).

## Lệnh test phạm vi hẹp

`cd packages/db && pnpm exec vitest run --config vitest.int.config.ts tests/policy-facts.int.test.ts`
