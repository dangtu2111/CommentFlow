# Kế hoạch `feat-pipe-confidence` — Độ tin cậy do code tính (FR-163) + kết quả không đọc được → 0 (FR-032)

## Việc

Mã gap matrix: `PIPE-CONFIDENCE` · Spec: FR-163, FR-032 (`docs/05`), `docs/09` §6.0 (công thức), §6 cổng 5, `docs/10` `drafts.confidence`/`confidence_components`.

**Tóm tắt:** Thêm vào `packages/ai` một module thuần (không gọi LLM, không DB) tính **độ tin cậy** của một bản nháp AI từ các tín hiệu đo được (xác suất nhãn, điểm nhận sản phẩm, điểm tìm kiến thức top-1 và khoảng cách với top-2, tỉ lệ ý `fact` có nguồn, hành động là `answer` hay không, đã hỏi lại trước đó hay chưa) theo công thức sigmoid (hàm ép một số bất kỳ về khoảng 0–1) với trọng số mặc định; **không bao giờ dùng số model tự chấm**. Kết quả LLM không đọc được (JSON hỏng, thiếu trường, số ngoài khoảng, hành động lạ) → độ tin cậy **0** và `needs_human` (chuyển người). Lưu từng thành phần (`confidence_components`) để giải thích "Không tự gửi vì…". Rủi ro: trọng số mặc định chưa hiệu chuẩn (AUTO-CALIBRATION, GĐ4) nên chỉ là tham số; cổng 5 chưa nối (AUTO-SEND-GATE).

## Điểm chưa rõ

Không có. Tự quyết (Q-PC1 ở `QUYET_DINH_CHO_DUYET.md`): (a) trọng số mặc định và "phiên bản trọng số" `default@1`; tín hiệu thiếu (null) tính là 0 — thiên về chặn; (b) `p_label` lấy từ `labels[0].confidence` của `extract` chỉ là **tín hiệu đầu vào** (ml hoặc logprob/tự nhất quán theo §6.0), không phải độ tin cậy cuối; (c) "loại hành động lạ → bỏ" (FR-032): hành động không thuộc `answer/clarify/redirect/handoff` bị bỏ, kết quả coi là không đọc được → 0 + chuyển người; (d) `handoff` luôn `needs_human` dù điểm cao (§6 mục 6); (e) không nối `checkGuardMoney` ở đây (thuộc cổng 6, không phải cổng 5) — nối ở AUTO-SEND-GATE/PIPE-DECIDE-ACTION.

## Tiêu chí nghiệm thu

1. `computeConfidence(signals)` trả `confidence ∈ [0,1]` = sigmoid(z) với z theo đúng công thức §6.0, và `components` ghi từng số hạng + trọng số + `z` — kiểm bằng: `confidence.test.ts` (FR-163), kể cả ca tay tính sẵn.
2. Tín hiệu do model tự chấm (`self_score`, `confidence` trong JSON LLM) **không** ảnh hưởng điểm: object có thêm trường đó cho cùng kết quả — kiểm bằng: `confidence.test.ts` (FR-163).
3. Đầu vào không đọc được (không phải object, số NaN/ngoài [0,1], hành động lạ) → `confidence = 0`, `needs_human = true`, lý do "Kết quả AI không đọc được", không ném — kiểm bằng: `confidence.test.ts` (FR-032).
4. `assessDraft`: bản nháp (`DraftResult`) + tín hiệu → tính `fact_sourced_ratio` từ `claims` (không `fact` → 1); bản nháp `needs_human` hoặc hành động `handoff` → `needs_human` giữ nguyên; đọc bản nháp lỗi (`LLM_UNAVAILABLE`) → 0 — kiểm bằng: `assess-draft.test.ts` (FR-163, FR-032).
5. Thuộc tính (fast-check): mọi tín hiệu hợp lệ → điểm trong [0,1], xác định (cùng đầu vào → cùng kết quả), **đơn điệu** (tăng một tín hiệu dương không làm điểm giảm; `asked_before` không làm tăng), mọi JSON tùy ý không đúng dạng → 0 — kiểm bằng: `confidence.test.ts` "property-based" (FR-163, FR-032).
6. Ngưỡng coverage `packages/ai` giữ 100% dòng + file `src/confidence/*.ts` ≥ 95% nhánh; cổng chung xanh — kiểm bằng: `pnpm --filter @flow/ai test:coverage`, lint, lint:i18n, typecheck, depcruise, check:plans, test:trace.

## File sẽ đọc (≤ ~8, kèm lý do)

Đã đọc: `docs/09` §4, §6, §6.0 (công thức); `docs/05` FR-032, FR-163; `docs/10` dòng `drafts`; `packages/ai/src/{index.ts, draft/draft-result.ts, draft/drafter.ts, classify/extract-result.ts}` (kiểu đầu vào); `guard-money.test.ts` (mẫu fast-check); `vitest.config.ts` (ngưỡng theo file).

## File sẽ sửa / tạo

- Tạo `packages/ai/src/confidence/confidence.ts` (công thức, Zod tín hiệu, FR-032) + `confidence.test.ts`; `assess-draft.ts` (ghép `DraftResult` → tỉ lệ fact có nguồn → điểm) + `assess-draft.test.ts`.
- Sửa `packages/ai/src/index.ts` (xuất), `packages/ai/vitest.config.ts` (ngưỡng nhánh theo file), `docs/testing/KIEM_TRA_TAY.md` (KT-PC), `docs/plans/{MASTER,QUYET_DINH_CHO_DUYET}.md`, `docs/gap-matrix.md`, `docs/codemap.md`, `docs/handoff/feat-pipe-confidence.md`.

## Migration

Không có (cột `drafts.confidence`/`confidence_components` theo `docs/10`, ghi khi nối pipeline).

## Test viết trước

`confidence.test.ts`, `assess-draft.test.ts` viết trước, chạy đỏ (module chưa có) rồi mới viết mã (độ tin cậy là logic quy tắc §4 STANDARD).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/confidence` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — một lần `verifier-security` (độ tin cậy là đầu vào cổng tự gửi §6 mục 5; kiểm "không dùng số model tự chấm" và đường FR-032 không thể cho điểm > 0).

## Rủi ro / câu hỏi cho chủ dự án

Trọng số mặc định là ước lượng (chưa có dữ liệu pilot); theo FR-163 khi chưa hiệu chuẩn thì không bật được Tự động (FR-072) — phần đó thuộc AUTO-CALIBRATION. Không cần tài nguyên ngoài, không gọi LLM.

## Đề xuất thay đổi

Không đổi `docs/01–16`.

## Complexity tracking

Không có (không thêm thư viện: `fast-check` đã có trong `packages/ai`; không thêm tầng trừu tượng).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec §6.0 + Q-PC1).
