# Kế hoạch `feat/pipe-orchestrator-f` — PIPE-ORCHESTRATOR lát F (hiện gợi ý, nút "Soạn gợi ý", Owner chỉnh trần câu AI)

**Trạng thái duyệt:** Đã duyệt (lát F của `docs/plans/feat-pipe-orchestrator.md`; chủ dự án chỉ đạo 07/11/2026: làm lát F ngay, gồm giao diện Owner chỉnh `max_ai_replies_per_customer_post` 1–5). Migration 0077 chỉ cấp quyền theo cột (không đổi RLS) → loại chỉ-thêm (Q-MRG2).

## Việc

Mã gap matrix: `PIPE-ORCHESTRATOR` (lát F), `AI-REPLY-CAP-CUSTOMER-POST` (giao diện Owner) · Spec: FR-043, FR-167; Q-POR8, Q-POR11, Q-POR14.

**Tóm tắt:** Chi tiết bình luận hiện câu gợi ý AI MỚI NHẤT (ghi rõ "chưa gửi"), lý do khi cần nhân viên, và nút "Soạn gợi ý" cho bình luận chưa có nháp (kể cả nhập ngược/backfill) hoặc đang "Cần nhân viên". Bấm nút chỉ xếp job `pipeline` thủ công kèm người bấm; worker đưa bình luận và khóa lượt về trạng thái xử lý được, ghi `action_logs` (ai bấm, trạng thái và lý do trước đó), rồi chạy qua CÙNG cổng dừng khẩn cấp/hạn mức/trần (chưa trừ lượt thì trừ, đã trừ thì không trừ thêm) và tạo bản nháp MỚI dù đã có bản "Cần nhân viên" cũ (bản cũ giữ làm lịch sử). Cài đặt › Tự động hóa có thẻ Owner chỉnh trần câu AI cho mỗi khách dưới mỗi bài (1–5, mặc định 3).

## Điểm chưa rõ

Không có. Playwright cho nút "Soạn gợi ý" cần worker thật trong E2E → gộp vào gap `E2E-WORKER` (đã ghi); phần này kiểm bằng test tích hợp DB/worker + kiểm tay KT-PIPE.

## Tiêu chí nghiệm thu

1. Chi tiết bình luận trả bản nháp MỚI NHẤT (bản cũ giữ làm lịch sử), tên nguồn, lý do và trạng thái khóa lượt; bản "Cần nhân viên" không thành câu gợi ý trong ô soạn; cô lập workspace — kiểm bằng: `comment-detail-draft.int.test.ts`.
2. Nút "Soạn gợi ý": chỉ hiện với bình luận `new`/`needs_human` chưa bị xóa và khi AI bật; hành động kiểm UUID, workspace/người dùng từ phiên, đẩy job thủ công kèm người bấm + khóa chống bấm đúp — kiểm bằng: `suggestion-request.test.ts`.
3. Worker chạy lại thủ công: chỉ nhận thành viên đang hoạt động và bình luận `new`/`needs_human`; đưa về trạng thái xử lý được; ghi `action_logs`; vẫn qua cổng dừng khẩn cấp/hạn mức (chưa trừ → trừ, đã trừ → KHÔNG trừ thêm); bản nháp MỚI dù đã có "Cần nhân viên" cũ; đường tự động vẫn idempotent; bấm đúp không nhân đôi — kiểm bằng: `pipeline-manual.int.test.ts`.
4. Owner chỉnh trần 1–5: chỉ Owner ghi (Staff/người ngoài/workspace khác bị RLS chặn), giữ nguyên cột khác, ngoài 1–5 bị từ chối ở máy chủ và DB (CHECK), không giả danh người ghi — kiểm bằng: `automation-settings.int.test.ts`, `reply-cap-settings.test.ts`.
5. Migration 0077 chỉ cấp INSERT/UPDATE đúng một cột cho `cf_app` — kiểm bằng: `pnpm db:check-rls`, `pnpm check:migrations`.
6. `pnpm precheck` xanh; DB/worker tích hợp xanh.

## File sẽ sửa / tạo

`packages/db`: migration `0077`, `queries/{automation-settings,comment-detail,pipeline-persist}.ts`; `apps/worker/src/jobs/{pipeline-job,pipeline-run,pipeline-persist}.ts`; `packages/shared/src/queues.ts` (`requestedBy`); `apps/web`: `server/{suggestion-request,reply-cap-settings,queue}.ts`, action nút, `components/comments/{comment-detail,request-suggestion-button}.tsx`, `components/automation/reply-cap-card.tsx`, trang tự động hóa, i18n; tài liệu: Q-POR15, KT-PIPE (bước nút), codemap, gap-matrix, handoff.

## Migration

`0077_reply_cap_owner_write.sql`: `GRANT INSERT/UPDATE (max_ai_replies_per_customer_post) ON cf.automation_settings TO cf_app`. Chỉ-thêm quyền theo cột; RLS (Owner/hệ thống ghi) không đổi. Đường lùi: REVOKE hai quyền đó.

## Cần kiểm chứng độc lập không?

Không bắt buộc. Có chạm hạn mức (không trừ lượt hai lần) nhưng dùng đúng cổng đã kiểm chéo ở lát C (`charged_at` ghi một lần); tự kiểm theo `verify.md` §A ghi ở handoff.

## Rủi ro / câu hỏi cho chủ dự án

Chạy lại thủ công đặt `attempts` về 1 (CHECK ≥ 1) nên còn 2 lần thử trong trần 3. Nút ẩn khi `PIPELINE_ENABLED` tắt ở máy chủ web (đọc biến môi trường): web và worker phải cùng cấu hình.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.
