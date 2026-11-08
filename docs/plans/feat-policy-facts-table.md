# Kế hoạch `feat/policy-facts-table` — Bảng chính sách có cấu trúc `cf.policy_facts` (DRAFT-FACT-SLOTS PR 2)

## Việc

Mã gap matrix: `DRAFT-FACT-SLOTS` · ADR 017 · kế hoạch cha `docs/plans/feat-draft-fact-slots.md` (PR 2 theo thứ tự đã duyệt). **Chồng lên PR 1 (#291)**.

**Tóm tắt (2–3 câu dễ hiểu):** Thêm bảng lưu chính sách có cấu trúc (ship theo khu vực, COD, đổi trả, bảo hành, thanh toán) làm nguồn chuẩn cho fact plan. Chỉ Owner được duyệt; hệ thống (worker) chỉ ghi ĐỀ XUẤT nháp kèm nguyên văn trích; bản nháp không bao giờ được đọc vào fact plan. Chạm migration + RLS + trigger nên **dừng cho chủ dự án kiểm chéo, không tự merge**.

## Điểm chưa rõ

Không có (thiết kế bảng đã nêu ở kế hoạch cha; chủ dự án duyệt 08/11/2026).

## Tiêu chí nghiệm thu

1. RLS: đọc = thành viên (hoặc ngữ cảnh không người dùng); ghi = Owner; hệ thống chỉ INSERT nháp `origin ≠ manual` và sửa/xóa BẢN NHÁP; Staff và `withWorkspace` trần không ghi; chéo workspace không thấy/không sửa/không xóa — kiểm bằng: `pnpm test:db` (`policy-facts.int.test.ts`) và `pnpm db:check-rls`.
2. Trigger `policy_facts_guard`: chỉ Owner đặt/giữ `approved` (42501 kể cả khi bỏ qua RLS), `approved_by/approved_at` do server đóng dấu (client không ghi được: không có trong GRANT), nháp không mang dấu duyệt, `workspace_id/kind/slot/origin` bất biến (23514), mỗi UPDATE tăng `rev` — kiểm bằng: cùng test.
3. `CHECK`: kind/status/origin trong danh sách, slot 1–100 ký tự, `data` là object, `origin ≠ manual` bắt buộc có `evidence` — kiểm bằng: cùng test.
4. Bản nháp KHÔNG vào danh sách đã duyệt; Owner duyệt thay bản đã duyệt cũ cùng (kind, slot) — kiểm bằng: `listApprovedPolicyFacts`/`approvePolicyFact` trong test tích hợp; `policyFactsFromRows` bỏ nháp kể cả khi truyền nhầm — kiểm bằng: `policy-rows.test.ts`.
5. Zod ở ranh giới: nội thành bắt buộc ghi thành phố, vùng có ≥ 1 tỉnh, ngày tối đa ≥ tối thiểu, tiền nguyên không âm, tiền tệ 3 chữ hoa, khóa lạ bị từ chối — kiểm bằng: `packages/shared/src/policy-facts.test.ts`.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/db/migrations/0043_product_aliases.sql` (mẫu policy), `packages/db/src/check-rls.ts` (kỳ vọng), `packages/db/migrations/0016_owner_only_policies.sql` (`is_workspace_owner`), `packages/db/tests/product-aliases.int.test.ts` (mẫu test), `docs/10_Database_Design.md` (quy ước).

## File sẽ sửa / tạo

Tạo: `packages/db/migrations/0083_policy_facts.sql` (+ journal), `packages/db/src/schema/cf/policy-facts.ts`, `packages/db/src/queries/policy-facts.ts`, `packages/db/tests/policy-facts.int.test.ts`, `packages/shared/src/policy-facts.ts` (+ test), `packages/ai/src/fact-plan/policy-rows.ts` (+ test). Sửa: `packages/db/src/check-rls.ts`, `schema/cf/index.ts`, `runtime.ts`, `packages/shared/src/index.ts`, `fact-plan/index.ts`.

## Migration

`0083_policy_facts`: bảng `cf.policy_facts` (cột/ràng buộc như `schema/cf/policy-facts.ts`), RLS bật + 4 policy (mỗi lệnh đúng một policy permissive), GRANT cột (INSERT: không gồm `approved_by/approved_at/rev`; UPDATE: chỉ `data, status, evidence, source_ref`), hàm + trigger `cf.policy_facts_guard` (SECURITY INVOKER). Chỉ-thêm; **đường lùi** ghi trong đầu migration: `DROP TRIGGER … ; DROP FUNCTION cf.policy_facts_guard(); DROP TABLE cf.policy_facts;` + bỏ kỳ vọng ở `check-rls.ts`. Chưa nơi nào đọc/ghi trong production (cờ `factSlots` TẮT) nên không cần phối hợp worker/web.

## Test viết trước

Test tích hợp RLS/trigger/CHECK viết cùng migration (xem tiêu chí 1–4); Zod và ánh xạ dòng có test đơn vị.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db test:db`; `pnpm db:check-rls`; `pnpm --filter @flow/shared exec vitest run src/policy-facts.test.ts`; `pnpm --filter @flow/ai exec vitest run src/fact-plan/policy-rows.test.ts`.

## Cần kiểm chứng độc lập không?

**Có** — migration, RLS, trigger. Phiên chính tự kiểm theo `docs/workflows/verify.md` §A+§B (kết quả ghi ở mô tả PR, nhãn "tự kiểm, chưa có kiểm chứng độc lập"); chủ dự án hoặc Codex kiểm chéo; **không tự merge**.

## Rủi ro / câu hỏi cho chủ dự án

Không có câu hỏi mới. Rủi ro: trigger là SECURITY INVOKER nên phụ thuộc `core.is_workspace_owner()` (SECURITY DEFINER sẵn có); nếu hàm đó đổi hành vi, kiểm lại.

## Đề xuất thay đổi

Sau khi duyệt: thêm bảng `policy_facts` vào `docs/10_Database_Design.md`.

## Complexity tracking

Một bảng mới, một trigger. Policy GHI theo vai trò: `withActor` + `is_workspace_owner` (Owner); `withJob` chỉ INSERT nháp `origin ≠ manual` và sửa/xóa nháp; đọc qua `withWorkspace`/`withActor`. Không thư viện mới.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

Đã duyệt (chủ dự án 08/11/2026: thứ tự PR (1)→(5), PR (2) dừng gửi kiểm chéo).
