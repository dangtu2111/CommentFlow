# Kế hoạch `feat-retention-job` — RETENTION-JOB

## Việc

Mã gap matrix: `RETENTION-JOB` (gồm phần retention của `DB-MAINTENANCE-ROLE`) · Spec: FR-126 (docs/05), docs/14 §"Lưu dữ liệu 12 tháng".

**Tóm tắt:** thêm vào job dọn dữ liệu có sẵn của worker (`apps/worker/src/jobs/retention.ts`) hai bước: (1) xóa bình luận, nháp AI và khách tiềm năng quá 12 tháng; (2) gộp `ai_usage` chi tiết quá 90 ngày thành bản theo ngày `ai_usage_daily` (giữ tổng chi phí/token). Cả hai là hàm DB chỉ chạy bằng kết nối `cf_worker` ở ngữ cảnh trần. Rủi ro: xóa là vĩnh viễn nên có cận dưới (180 ngày / 30 ngày) chặn gọi nhầm; không đụng nhật ký kiểm toán, hóa đơn.

## Điểm chưa rõ

Không có (tự chọn phương án an toàn, ghi Q-RET1).

## Tiêu chí nghiệm thu

1. Bình luận/nháp AI cũ hơn 365 ngày và khách tiềm năng không cập nhật quá 365 ngày bị xóa; bản mới hơn giữ nguyên; `action_logs` giữ — kiểm bằng: `packages/db/tests/retention-job.int.test.ts`.
2. `ai_usage` > 90 ngày được gộp theo (workspace, ngày UTC, bước, model, prompt, cache), tổng token/chi phí/số lần gọi bảo toàn, chạy lại cộng dồn đúng — kiểm bằng: int test + property test `retention-policy.test.ts`.
3. Hàm xóa/gộp chỉ chạy ở ngữ cảnh trần của `cf_worker`; web/actor/job workspace bị từ chối `42501`; số ngày dưới cận dưới bị `CF422` — kiểm bằng: int test.
4. Thành viên chỉ đọc `ai_usage_daily` của workspace mình, `cf_app` không ghi được — kiểm bằng: int test + `pnpm db:check-rls`.
5. Job worker chạy 4 bước độc lập, lỗi một bước không chặn bước khác, log chỉ có số lượng/tên lỗi — kiểm bằng: `retention-data.test.ts`.

## File sẽ đọc

`apps/worker/src/jobs/retention.ts`, `packages/db/src/retention.ts`, `migrations/0040_*.sql` (mẫu hàm), `check-rls.ts` (các mảng), schema `ai-usage/comments/leads/drafts`.

## File sẽ sửa / tạo

Migration `0053_retention_job.sql` (+ snapshot/journal), `schema/cf/ai-usage.ts`, `retention.ts`, `retention-policy.ts` (logic thuần), `runtime.ts` (export), `check-rls.ts`, `jobs/retention.ts`, các test, docs.

## Migration

0053: bảng `cf.ai_usage_daily` (RLS, cf_app chỉ SELECT) + `cf.compact_ai_usage(int)` + `cf.purge_expired_workspace_data(int)`. Lùi: DROP 2 hàm + bảng.

## Test viết trước

Property-based cho chính sách (mốc cắt, bảo toàn tổng khi gộp); test worker; int test DB.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run src/retention-policy.test.ts`; `pnpm --filter @flow/worker exec vitest run src/jobs/retention`; `pnpm test:db`.

## Cần kiểm chứng độc lập không?

Có: verifier-db (migration/hàm DEFINER) và verifier-security (xóa dữ liệu, quyền hàm, RLS).

## Rủi ro / câu hỏi cho chủ dự án

Chưa có bảng tin nhắn nên chưa dọn tin nhắn (gap `RETENTION-MESSAGES`). Xóa workspace vĩnh viễn (`DB-MAINTENANCE-ROLE` phần còn lại) chưa làm.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking

**Trạng thái duyệt:** Đã duyệt (tự duyệt — mọi quyết định đã có trong FR-126/Q-RET1).
