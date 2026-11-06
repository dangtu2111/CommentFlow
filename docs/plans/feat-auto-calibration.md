# Kế hoạch `feat-auto-calibration` — Hiệu chuẩn ngưỡng tự gửi và độ tin cậy

## Việc

Mã gap matrix: `AUTO-CALIBRATION` · Spec: FR-072 (50/10%/15/0,80; đề xuất kèm lý do; Owner xác nhận), FR-163 (hiệu chuẩn độ tin cậy bằng hồi quy logistic), `docs/09` §6 (đoạn "Hiệu chuẩn ngưỡng") + §6.0, US-041.

**Tóm tắt:** Dựa trên việc nhân viên gửi nguyên văn hay sửa/bỏ câu AI, hệ thống đề xuất nâng/hạ ngưỡng tự gửi (không bao giờ dưới sàn 0,80) và đề xuất bộ trọng số độ tin cậy mới (hồi quy logistic — mô hình thống kê học xem điểm nào thì câu thường đúng). Chỉ làm **hàm thuần**: nhận danh sách mẫu đã đọc ở DB, trả đề xuất kèm lý do dạng mã + số liệu để giao diện dịch vi/en. Đề xuất chỉ hiển thị, Owner xác nhận mới áp dụng; thiếu dữ liệu thì không đề xuất và không cho bật Tự động. Rủi ro: chưa nối DB/UI nên chưa có hiệu lực thật.

## Điểm chưa rõ

Không có. Lựa chọn phụ ghi ở `docs/plans/quyet-dinh/q-ac1.md`.

## Tiêu chí nghiệm thu

1. < 50 mẫu hợp lệ → `insufficient_data`, không đề xuất, `canEnableAuto = false` — test `FR-072`.
2. Khoảng trên ngưỡng (`confidence ≥ ngưỡng`) có ≥ 10 mẫu và > 10% bị sửa → đề xuất nâng (bước 0,02, tối đa 0,99) kèm lý do + số liệu — test `FR-072`.
3. Khoảng dưới ngưỡng (rộng 0,05) có ≥ 15 mẫu và 0% sửa → đề xuất hạ (bước 0,02), không bao giờ dưới sàn 0,80; đang ở sàn → giữ + lý do `at_floor` — test `FR-072`.
4. Nâng ưu tiên hơn hạ; đề xuất không tự áp dụng (hàm thuần, chỉ trả kết quả); `canEnableAuto` chỉ khi ≥ 50 mẫu và tỷ lệ sửa chung ≤ 10% (US-041) — test + property-based.
5. Mẫu hỏng (NaN, ngoài [0,1]) bị bỏ và đếm, không ném; kết quả không phụ thuộc thứ tự mẫu; tính riêng theo `(kênh, nhãn, ngôn ngữ)` — test + property-based (fast-check).
6. Hồi quy logistic (FR-163): < 50 mẫu hoặc < 10 mẫu một lớp → giữ trọng số mặc định; đủ dữ liệu → trọng số mới thỏa `confidenceWeightsSchema` (hữu hạn, hệ số tín hiệu ≥ 0), log-loss không tệ hơn mặc định, xác định (cùng đầu vào → cùng kết quả) — test + property-based.
7. Véc-tơ đặc trưng của bộ hiệu chuẩn cho cùng `z` với `computeConfidence` (không lệch công thức §6.0); đường hiệu chuẩn (reliability) + ECE trong [0,1] — test.
8. Coverage `packages/ai` không giảm ngưỡng — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

Đã đọc: `docs/03` M08, `docs/09` §6/§6.0, `packages/ai/src/confidence/confidence.ts`, `gate/auto-send-gate.ts` (hằng ngưỡng), `automation/settings.ts`, mẫu `delay/`.

## File sẽ sửa / tạo

- `packages/ai/src/calibration/threshold-calibration.ts` (+ test) — đề xuất ngưỡng FR-072.
- `packages/ai/src/calibration/confidence-fit.ts` (+ test) — hồi quy logistic + đường hiệu chuẩn FR-163.
- `packages/ai/src/calibration/index.ts`; `packages/ai/src/index.ts` (một dòng export module mới).
- `docs/gap-matrix.md` (dòng AUTO-CALIBRATION + AUTO-CALIBRATION-WIRE), `docs/plans/MASTER.md` (dòng việc), `docs/codemap.d/mien-packages-ai-src-calibration.md`, `docs/plans/quyet-dinh/q-ac1.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-ac.md`, `docs/handoff/feat-auto-calibration.md`.

## Migration

Không có. Phần DB (đọc `drafts` + `drafts.confidence_components`, lưu đề xuất/xác nhận, job hằng tuần, tab Chạy thử & xem lại) → `AUTO-CALIBRATION-WIRE` (làn b + nối UI).

## Test viết trước

Toàn bộ test ở `packages/ai/src/calibration/` viết và chạy đỏ trước khi có mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/calibration`

## Cần kiểm chứng độc lập không?

Có, một lần `verifier-security` — ngưỡng/độ tin cậy là đầu vào của cổng 5 tự gửi (sàn 0,80, đề xuất không tự áp dụng).

## Rủi ro / câu hỏi cho chủ dự án

Không có câu hỏi. Chưa nối DB nên chưa ảnh hưởng staging.

## Đề xuất thay đổi

Không đổi `docs/01–16`.

## Complexity tracking

Không có (không thêm thư viện; `fast-check` đã có).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR; lựa chọn phụ ghi Q-AC1).
