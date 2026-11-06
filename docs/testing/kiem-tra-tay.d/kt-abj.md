## KT-ABJ — Job phát hiện lạm dụng (ABUSE-JOB, FR-115)

Chỉ phần máy (chưa đăng ký job, chưa ghi DB): người thử chạy test.
1. `pnpm --filter @flow/ai exec vitest run src/abuse` và `pnpm --filter @flow/worker exec vitest run src/jobs/abuse.test.ts` → xanh. Kết quả mong đợi: không test đỏ (câu bị xóa >20% chỉ cảnh báo, từ khóa cấm chặn tự gửi + xem xét, lỗi gửi liên tiếp dừng workspace và thông báo đúng một lần, quyết định không bao giờ có hành động ẩn bình luận).

---
