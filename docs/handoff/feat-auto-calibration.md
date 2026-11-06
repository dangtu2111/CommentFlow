# Bàn giao `feat-auto-calibration` (agent: claude, làn c)

**Đã làm:** plan + Q-AC1; `packages/ai/src/calibration/` (`threshold-calibration.ts` đề xuất ngưỡng FR-072; `confidence-fit.ts` hồi quy logistic + reliability/ECE FR-163) với test ví dụ + property-based; export ở `packages/ai/src/index.ts`; gap matrix (AUTO-CALIBRATION, AUTO-CALIBRATION-WIRE)/MASTER/codemap/KT-AC.

**Đã đọc + rút ra:** `DEFAULT_THRESHOLD` 0,85 / `THRESHOLD_FLOOR` 0,80 ở `gate/auto-send-gate.ts`; `computeConfidence` (§6.0) thiếu tín hiệu = 0, margin chỉ khi có top1 và top2; `confidenceWeightsSchema` đòi hệ số tín hiệu ≥ 0 nên hồi quy chiếu về 0. Worktree có thay đổi chưa commit ở `packages/db/migrations/0047_*.sql` — KHÔNG phải của việc này, không add.

**Còn lại:** `AUTO-CALIBRATION-WIRE` (đọc `drafts` trong `withWorkspace`, API/UI bảng hiệu chuẩn, Owner xác nhận, bảng trọng số đã duyệt, job hằng tuần) — cần migration, làn b.

**Verifier-security (1 lần):** đã sửa mục chặn merge (bias bị chiếu để bản nháp không có tín hiệu < 0,80; prior hỏng → dùng mặc định; khóa nhóm dùng JSON). Còn để cho WIRE: tách tập kiểm (holdout) khi chọn trọng số; mẫu hiệu chuẩn ngưỡng cần `weights_version` (chỉ tính mẫu cùng phiên bản trọng số); tên version duy nhất theo nhóm; `invalid_threshold` thay vì tự lấy 0,85.
