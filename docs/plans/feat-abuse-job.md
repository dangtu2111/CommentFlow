# Kế hoạch `feat-abuse-job` — Job phát hiện lạm dụng

## Việc

Mã gap matrix: `ABUSE-JOB` · Spec: FR-115, `docs/09` §11.2, `docs/13` §4.

**Tóm tắt:** Job `abuse` (15 phút/lần, mỗi workspace một lần) gom số liệu, chấm các tín hiệu lạm dụng (Đánh dấu sai, lỗi liên tiếp, chi phí, lỗi 368, tăng đột biến — đã có ở `evaluateAutoPause` — cộng thêm câu bị xóa/ẩn sau khi gửi >20%/24 giờ và từ khóa cấm) rồi áp quyết định. Làm phần thuần + handler chạy trong `withJob` với nguồn số liệu/thông báo là interface (bản bộ nhớ để test); chưa có bảng nên chưa nối DB thật. Rủi ro: dừng nhầm do ngưỡng; job KHÔNG BAO GIỜ ẩn bình luận (kiểu quyết định không có trường ẩn).

## Điểm chưa rõ

Không có. (Quyết định tự chọn: `docs/plans/quyet-dinh/q-abj1.md`.)

## Tiêu chí nghiệm thu

1. Câu bị xóa/ẩn sau gửi >20% trong 24 giờ (≥10 câu) → cảnh báo Admin, KHÔNG dừng; đúng 20% hoặc <10 câu → không; số liệu hỏng → không cảnh báo giả — test + property.
2. Từ khóa cấm (bỏ dấu, không phân biệt hoa/thường, theo ranh giới từ) trong câu gửi/kiến thức → `blockAutoSend` + mục hàng xem xét (chỉ id + từ khóa, KHÔNG chứa nội dung); không khớp → không — test + property.
3. `evaluateAbuse` hợp nhất: giữ nguyên quyết định của `evaluateAutoPause`; kết quả không có hành động ẩn bình luận nào — test + property (đầu ra không có khóa `hide`).
4. Job: `workspaceJob` (withJob) → nạp số liệu đúng workspace → `evaluateAbuse` → `apply` → thông báo Owner/Admin đúng MỘT lần (`newlyPaused`) → ghi tín hiệu; payload sai → `VALIDATION_FAILED`; nguồn số liệu lỗi → ném để pg-boss thử lại, không đặt cờ; thông báo lỗi không làm mất cờ — test.
5. Số liệu của workspace khác (records/outcomes mang `workspaceId` khác) bị loại — test.
6. Coverage `packages/ai` không giảm — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`autopause/*`, `history/marked-wrong-signal.ts`, `history/auto-sent-record.ts`, `apps/worker/src/jobs/run-job.ts` (+test), `queue/definitions.ts`, `docs/09` §11.2.

## File sẽ sửa / tạo

Tạo `packages/ai/src/abuse/{abuse-signals,banned-keywords,index}.ts` + test; `apps/worker/src/jobs/abuse.ts` + test; một dòng export ở `packages/ai/src/index.ts`; `apps/worker/src/queue/definitions.ts` (khai hàng đợi `abuse`); `docs/codemap.d/mien-packages-ai-src-abuse.md`, `diem-vao-…` job; `q-abj1.md`, `kt-abj.md`/`tt-abj.md`; dòng `ABUSE-JOB` ở MASTER/gap-matrix + `ABUSE-JOB-WIRE`.

## Migration

Không có (chỉ làn b). `abuse_signals` (docs/10) và cột khóa kênh → `ABUSE-JOB-WIRE`.

## Test viết trước

Toàn bộ logic quy tắc + handler: test trước, rồi mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/abuse` · `pnpm --filter @flow/worker exec vitest run src/jobs/abuse.test.ts`

## Cần kiểm chứng độc lập không?

**Có** — chạm cổng tự gửi (tạm dừng, chặn tự gửi) và quy tắc "AI không tự ẩn": `verifier-security` một lần cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

Không có việc chỉ chủ dự án làm được. Danh sách từ khóa cấm mặc định nhỏ, chỉnh được ở nơi gọi; Admin duyệt thêm sau.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có (nguồn số liệu/thông báo là interface vì có 2 nơi dùng: bản bộ nhớ test + DB sau này, như `AutoPauseStore`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: quyết định đã có trong docs/09 §11.2 + Q-ABJ1).
