# Kế hoạch `feat-kb-tryai` — Ô Thử AI hiện đoạn tìm được + điểm từ KB (FR-059)

## Việc

Mã gap matrix: `KB-TRYAI` · Spec: FR-059, FR-057, FR-134, US-034.

**Tóm tắt:** Ô Thử AI đang tìm trong kiến thức mẫu (từ khóa). Việc này thêm bản nối `TryKnowledge` vào `searchKbChunks` (tìm kết hợp vector + toàn văn + trigram) để ô Thử AI hiện **đoạn kiến thức thật tìm được kèm điểm liên quan (0–1)**, chạy sau một cờ môi trường mặc định TẮT; embedding vẫn là bản fixture (mock). Rủi ro: chưa có worker điền `embedding` nên nhánh vector rỗng, chỉ nhánh toàn văn/trigram có kết quả; chưa ghi `retrieval_logs` (cần bảng ghi từ job, ngoài phạm vi, không migration).

## Điểm chưa rõ

Không có. Tự quyết ở `QUYET_DINH_CHO_DUYET.md` (Q-KTA1).

## Tiêu chí nghiệm thu

1. `createKbTryKnowledge.searchKb` nhúng câu hỏi bằng `Embedder`, gọi `KbSearcher` với đúng ngôn ngữ + sản phẩm, trả `TryCandidate` có điểm = `rrfRelevance(score)` (0..1), sắp giảm dần — kiểm bằng `kb-try-knowledge.test.ts`.
2. Đoạn nghi cài lệnh (`scanInjection`) không thành ứng viên — test.
3. Chủ đề đoạn suy từ tiêu đề + nội dung (ship → `shipping`, đổi trả → `policy`) để `decideAction` biết ý hỏi nào đã có nguồn — test.
4. Sản phẩm (`matchProducts`/`lookupProductFacts`) vẫn lấy từ bản nền (không từ KB/vector, nguyên tắc #4) — test.
5. `runTryPipeline` truyền `lang` + `productIds` cho `searchKb` — test.
6. Cờ `TRY_AI_KB_REAL` TẮT (mặc định) → dùng demo như cũ; BẬT → dựng KB thật qua `withActor` + phiên bản mới nhất; lỗi/chưa có phiên bản → `unavailable`/rơi về demo có ghi cảnh báo — test `try-ai.test.ts`.
7. i18n vi+en cho khóa mới (nhãn điểm/nguồn KB), `pnpm lint:i18n` xanh.

## File sẽ đọc

`packages/ai/src/try/try-pipeline.ts`, `demo-knowledge.ts`, `retrieve/kb-searcher.ts`, `retrieve/sources.ts`, `apps/web/src/server/try-ai.ts`, `.../try-ai/actions.ts`, `components/try-ai/try-ai-result.tsx`.

## File sẽ sửa / tạo

- tạo `packages/ai/src/try/kb-try-knowledge.ts` (+ test); sửa `try-pipeline.ts` (chữ ký `searchKb(query, ctx)`, export `inferTopic`), `demo-knowledge.ts` (nhận tham số thừa), `packages/ai/src/index.ts`
- sửa `apps/web/src/server/try-ai.ts` (+ test), `actions.ts`, `try-ai-result.tsx`, `messages/vi.json`/`en.json`, `env.example`
- docs: QUYET_DINH, CAN_BAN_CUNG_CAP, KIEM_TRA_TAY, gap-matrix, MASTER, codemap, handoff

## Migration

Không có.

## Test viết trước

`kb-try-knowledge.test.ts`, bổ sung `try-pipeline.test.ts`, `try-ai.test.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/try` · `pnpm --filter @flow/web exec vitest run src/server/try-ai.test.ts` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không (không đụng auth/RLS mới/cổng tự gửi; chỉ đọc qua `withActor`, tìm có sẵn).

## Rủi ro / câu hỏi cho chủ dự án

Không có.

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
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR, Q-KTA1).
