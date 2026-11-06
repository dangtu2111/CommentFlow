# Kế hoạch `feat-pipe-classify-extract` — Phân loại 6 nhãn + `extract` một bước

## Việc

Mã gap matrix: `PIPE-CLASSIFY-EXTRACT` · Spec: FR-027, FR-145, FR-162 (`docs/05`), `docs/09` §4 dòng `classify → extract`, `docs/10` `comments.labels`/`drafts.extracted`.

**Tóm tắt:** Thêm vào `packages/ai` một bước "phân loại + tách thông tin" cho bình luận: MỘT lần gọi LLM nhỏ trả về nhiều nhãn (`labels[]`, trong 6 nhãn chuẩn) và các thông tin khách nói (sản phẩm, size, màu, số lượng, giá khách nhắc, ý đặt hàng…). Kết quả được Zod (thư viện kiểm kiểu dữ liệu) kiểm và chuẩn hóa bằng code (nhãn chính do code chọn). Gọi LLM thật nằm sau interface `Extractor`, đi qua `createLlmClient` có sẵn (ghi `ai_usage`, bắt buộc văn bản đã che PII); cờ `CLASSIFY_LLM_ENABLED` mặc định TẮT; có bản mock theo fixture để test. Rủi ro: chưa có khóa LLM trả phí nên chỉ "Xong-mock"; chất lượng prompt chưa đo (đợi `EVAL-RUNNER`).

## Điểm chưa rõ

Không có. Các lựa chọn tự quyết (Q-PCE1, ghi ở `QUYET_DINH_CHO_DUYET.md`): (a) chỉ làm nhánh LLM, chưa có bộ phân loại `services/ml` (FR-027 "ml trước") — để việc ML sau; (b) `order_intent.phone` luôn do code điền từ số trước khi che (PII-MASK-PIPE), LLM không bao giờ thấy số thật nên giá trị LLM trả về bị bỏ; (c) nhãn chính = nhãn độ tin cậy cao nhất do code chọn; (d) kết quả không đọc được → ném `AppError('LLM_UNAVAILABLE')` để bước sau chuyển người (FR-032, làm ở PIPE-CONFIDENCE), không gọi lại (NFR-C7).

## Tiêu chí nghiệm thu

1. Schema `extract` đúng FR-162 (labels[], product_mentions[], refers_to_image, size, color, height_cm, weight_kg, qty, cited_price_vnd, order_intent{items,phone,address}, asks[]); thiếu/sai kiểu → bị từ chối — kiểm bằng: `extract-result.test.ts` (FR-162).
2. `labels[]` chỉ chứa 6 nhãn chuẩn, khử trùng (giữ độ tin cậy cao nhất), sắp giảm dần, ≥ 1 nhãn, nhãn chính là phần tử đầu; có `complaint` ở bất kỳ vị trí → `hasLabel` đúng — kiểm bằng: `extract-result.test.ts` (FR-145).
3. Đầu ra LLM bọc ```json hoặc kèm chữ thừa vẫn đọc được; không phải JSON/sai schema → `AppError LLM_UNAVAILABLE`, thông báo không chứa nội dung khách — kiểm bằng: `extract-result.test.ts`, `extractor.test.ts`.
4. `createLlmExtractor` gọi đúng MỘT lần `llm.call` với step `extract`, `promptVersion` cố định, văn bản khách đã `MaskedText`, system prompt cố định; `phone` do LLM trả bị bỏ (null) — kiểm bằng: `extractor.test.ts` (FR-027, FR-162).
5. Cờ: `loadClassifyConfig` mặc định TẮT, chỉ đúng `true` mới bật, model mặc định `mock-llm` — kiểm bằng: `classify-config.test.ts`.
6. Bản mock theo fixture trả kết quả cố định, không gọi mạng; không khớp → nhãn `other` — kiểm bằng: `fixture-extractor.test.ts`.
7. Ngưỡng coverage `packages/ai` giữ nguyên, đạt — kiểm bằng: `pnpm --filter @flow/ai test:coverage`.
8. Cổng chung xanh — kiểm bằng: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace.

## File sẽ đọc (≤ ~8, kèm lý do)

Đã đọc: `packages/ai/src/{index,llm-client}.ts` (cổng LLM), `packages/ai/vitest.config.ts` (ngưỡng), `packages/shared/src/{comment-labels,pii}.ts` (6 nhãn, `MaskedText`), `env.example` (đặt tên biến), `docs/CAN_BAN_CUNG_CAP.md` + `docs/testing/KIEM_TRA_TAY.md` (định dạng).

## File sẽ sửa / tạo

- Tạo `packages/ai/src/classify/extract-result.ts` (+ `.test.ts`): schema Zod, đọc đầu ra LLM, chuẩn hóa, `hasLabel`.
- Tạo `packages/ai/src/classify/extract-prompt.ts`: prompt hệ thống cố định + dựng tin nhắn (kiểm trong `extractor.test.ts`).
- Tạo `packages/ai/src/classify/extractor.ts` (+ `.test.ts`): interface `Extractor`, `createLlmExtractor`.
- Tạo `packages/ai/src/classify/classify-config.ts` (+ `.test.ts`): `loadClassifyConfig` (cờ + model).
- Tạo `packages/ai/src/classify/fixture-extractor.ts` (+ `.test.ts`): mock theo fixture.
- Sửa `packages/ai/src/index.ts` (xuất), `env.example` (tên biến), `docs/CAN_BAN_CUNG_CAP.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/plans/MASTER.md`, `docs/gap-matrix.md`, `docs/codemap.md`, `docs/handoff/feat-pipe-classify-extract.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/05` FR-162 (ghi chú phone).

## Migration

Không có (lưu `comments.labels`/`drafts.extracted` thuộc việc nối pipeline sau; cột đã có theo `docs/10`).

## Test viết trước

Toàn bộ test ở mục File sẽ tạo viết trước và chạy thấy đỏ (module chưa tồn tại) rồi mới viết mã (STANDARD §4: tách thông tin `extract`).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/classify` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không — không chạm auth/RLS/cổng tự gửi/`sendRecheck`/migration; che PII chỉ được dùng lại qua kiểu `MaskedText` (không đổi `maskPii`).

## Rủi ro / câu hỏi cho chủ dự án

Cần khóa LLM trả phí + tên model nhỏ để bật thật (mục mới trong `CAN_BAN_CUNG_CAP.md`). Chưa có đánh giá chất lượng (đợi `EVAL-RUNNER`).

## Đề xuất thay đổi

`docs/05` FR-162: ghi chú `order_intent.phone` do code điền từ số trước khi che (đã áp dụng theo Q-PCE1).

## Complexity tracking

Không có (interface `Extractor` có 2 cài đặt thật: LLM + fixture; không thêm thư viện — Zod đã có).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt 06/11: mọi quyết định có trong spec/Q-PCE1).
