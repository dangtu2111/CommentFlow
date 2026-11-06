# Handoff `feat-abuse-job` (claude, làn d)

## Đã làm
- `packages/ai/src/abuse/`: `evaluateAbuse` thuần (= `evaluateAutoPause` + câu bị xóa/ẩn >20%/24 giờ + từ khóa cấm; lọc đúng `workspaceId`; không có hành động ẩn bình luận), `scanBannedKeywords`, `AbuseSink` + bản bộ nhớ.
- `apps/worker/src/jobs/abuse.ts`: `createAbuseHandler` (`workspaceJob` → `withJob`), `AbuseMetricsSource`; hàng đợi `abuse` ở `queue/definitions.ts`.
- Docs: Q-ABJ1, codemap, KT-ABJ, gap-matrix `ABUSE-JOB` ✅ Xong-mock + `ABUSE-JOB-WIRE`, MASTER.

## Đã đọc + rút ra
- `autopause/*`: `apply` đặt cờ rồi hủy hẹn giờ, trả `newlyPaused`; `evaluateAutoPause` không mang `workspaceId` → `evaluateAbuse` lọc trước khi gọi.
- `run-job.ts`: `workspaceJob` mở `withJob(payload.workspaceId)`; payload sai → `VALIDATION_FAILED`.

## Còn lại (`ABUSE-JOB-WIRE`, cần migration làn b)
`abuse_signals`, cờ chặn tự gửi/hàng xem xét, `channels.send_suspended_*`, nguồn số liệu + sink DB, đăng ký handler + lịch 15 phút trong `main.ts`, theo dõi sự kiện câu bị xóa/ẩn.
