# Kế hoạch `feat/kb-gaps-tu-chuyen-nguoi` — Gap từ chuyển người và trang "Dữ liệu còn thiếu"

## Việc

Mã gap matrix: `KB-GAPS-FROM-HANDOFF` · Spec: FR-134, UF-11 (lệnh tổng 10/11/2026, M2).

**Tóm tắt (2–3 câu dễ hiểu):** Khi AI phải chuyển người, dùng câu dự phòng hoặc plan báo thiếu dữ liệu, hệ thống ghi thành "dữ liệu còn thiếu" để Owner điền thẻ chính sách hoặc viết FAQ. Owner bấm "Thử lại câu này" để xem AI trả lời ra sao, và khi duyệt thẻ chính sách thì các mục cùng chủ đề tự đóng. Rủi ro thấp: không migration; nút thử lại tốn lượt Thử AI nên có giới hạn 1 lần/dòng/phút.

## Điểm chưa rõ

Không có. (Tiêu đề trang theo lệnh là "Dữ liệu còn thu(…)", hiểu là "còn thiếu" khớp mô tả M3.)

## Tiêu chí nghiệm thu

1. `toGapInputs` có gap cho handoff `claim_unsupported`, `chosen ∈ {fallback, handoff}`, `plan.unknownTopics`; không trùng chủ đề; `chosen = reply` thì không thêm — kiểm bằng: `persist-records.test.ts`.
2. Thẻ chính sách duyệt → gap `open` cùng chủ đề của workspace mình thành `resolved` cùng giao dịch; chủ đề khác/workspace khác không đổi — kiểm bằng: `policy-facts.int.test.ts` (DB thật).
3. "Thử lại câu này": chạy câu mẫu qua Thử AI (LLM giả qua DI), 1 lần/dòng/phút, gap lạ → 404, lỗi AI chuyển lý do — kiểm bằng: `server/gap-retry.test.ts`, `lib/kb-gaps-links.test.ts`.
4. Nút "Điền thẻ" đúng thẻ theo chủ đề — kiểm bằng: `kb-gaps-links.test.ts`. Playwright: không làm (chưa có khung E2E-KB cho trang này).

## File sẽ đọc / sửa

Đọc: `persist-records.ts`, `run-pipeline.ts`, `policy-facts.ts`, `retrieval-logs.ts`, `try-ai.ts`, trang/ hành động/ hàng `kb-gaps`. Sửa/tạo: các file đó + `gap-retry.ts`, `try-ai-instance.ts`, `kb-gaps-links.ts`, i18n vi/en, codemap.d, gap-matrix, `q-kb-gaps-handoff.md`.

## Migration

Không.

## Test viết trước

Có (test `toGapInputs`, `gap-retry`, `kb-gaps-links`, int policy-facts).

## Lệnh test phạm vi hẹp

`cd packages/ai && npx vitest run src/pipeline/persist-records.test.ts`; `cd apps/web && npx vitest run src/server/gap-retry.test.ts src/lib/kb-gaps-links.test.ts`; `cd packages/db && pnpm test:db`

## Cần kiểm chứng độc lập không?

Không (không đụng auth/RLS/guard/cổng tự gửi; chỉ đổi trạng thái gap trong giao dịch Owner đã được trigger cho phép).

## Rủi ro / câu hỏi cho chủ dự án

Giới hạn 1 lần/phút nằm trong bộ nhớ tiến trình (như quota Thử AI), nhiều tiến trình thì lỏng hơn.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
