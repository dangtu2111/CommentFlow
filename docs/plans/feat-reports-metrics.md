# Kế hoạch feat-reports-metrics — REPORTS metrics (FR-083, phần logic)

## Việc

Mã gap matrix: `REPORTS-METRICS` (tách từ `REPORTS`, FR-083) · Spec: `docs/03_Product_Requirements.md` §4 (Chỉ số sản phẩm), `docs/05` FR-083.

**Tóm tắt:** Tính các chỉ số báo cáo từ bảng `comments` có sẵn: % trả lời trong 15 phút, thời gian phản hồi trung vị, giờ tiết kiệm nhờ AI tự gửi, phân bố giờ cao điểm, năng suất từng nhân viên; xuất CSV. Là hàm thuần (`@flow/shared`) + một truy vấn chỉ đọc (`@flow/db`). Nhân viên (Staff) chỉ thấy số của chính mình. Không có giao diện, không migration, không gửi gì ra nền tảng (nên không chạm luật Meta 24 giờ/7 ngày; báo cáo chỉ ĐỌC `replied_at`). Rủi ro: định nghĩa mẫu số và hằng "phút tiết kiệm" là giả định (Q-RPT1).

## Điểm chưa rõ

Không có (đã tự chọn khuyến nghị, ghi Q-RPT1).

## Tiêu chí nghiệm thu

1. Trung vị thời gian phản hồi đúng (số lẻ/chẵn, rỗng → null), chỉ tính bình luận đã trả lời, loại bình luận của chính Page, đã xóa, và thời gian âm — kiểm bằng `reports.test.ts`.
2. % trả lời trong 15 phút: đúng ngưỡng (15:00 tính là đạt, 15:00,001 không) — `reports.test.ts`.
3. Giờ tiết kiệm = số bình luận `auto_replied` × phút/lượt (cấu hình, mặc định 2) / 60 — test.
4. Phân bố giờ cao điểm theo múi giờ cấu hình (mặc định UTC+7), 24 ô, tổng = số bình luận trong phạm vi; giờ cao điểm sắp ổn định khi hòa — test + property (fast-check).
5. Năng suất theo nhân viên chỉ dùng id (không tên/PII), tổng các nhân viên ≤ tổng đã trả lời — test + property.
6. Staff: `buildReport` với vai trò staff chỉ ra số của chính user, không có dòng của người khác, `hoursSaved`/`answerRate` = null; Owner/Admin thấy toàn bộ — test.
7. CSV theo RFC 4180, chống chèn công thức (`= + - @` đầu ô), dòng cố định thứ tự — test + property (mọi ô tự do được trích dẫn đúng).
8. Lọc theo khoảng thời gian `[from, to)` và kênh — test.
9. Truy vấn `loadReportRows` chỉ đọc, ép `workspace_id`, tham số hóa — test với DB giả.

## File sẽ đọc

`docs/03` §4, `packages/db/src/schema/cf/comments.ts` (cột), `packages/db/src/queries/readiness.ts` (mẫu truy vấn), `packages/shared/src/data-export.ts` (mẫu), `packages/shared/src/index.ts` (export).

## File sẽ sửa / tạo

- `packages/shared/src/reports.ts` + `reports.test.ts` — logic thuần, CSV.
- `packages/shared/src/index.ts` — export.
- `packages/db/src/queries/reports.ts` + `reports.test.ts` — truy vấn đọc.
- `docs/plans/quyet-dinh/qrpt1.md`, `docs/codemap.d/mien-bao-cao-chi-so.md`, `docs/handoff/feat-reports-metrics.md`, dòng gap-matrix/MASTER.

## Migration

Không có. Phần cần bảng (tin nhắn Messenger/DM, `drafts` để tính "gửi nguyên văn", lưu báo cáo, email tuần) ghi vào gap `REPORTS-MESSAGES`, `REPORTS-WEEKLY-EMAIL` (cần làn b).

## Test viết trước

Toàn bộ `reports.test.ts` (unit + fast-check) viết đỏ trước khi có `reports.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/reports.test.ts` · `pnpm --filter @flow/db exec vitest run src/queries/reports.test.ts` · `pnpm --filter @flow/shared test:coverage`

## Cần kiểm chứng độc lập không?

Không (chỉ đọc; phạm vi vai trò Staff là hàm thuần có test; không auth/RLS/PII mới — id người dùng nội bộ, không tên/SĐT).

## Rủi ro / câu hỏi cho chủ dự án

Mẫu số "% trong 15 phút" và hằng 2 phút/lượt tiết kiệm là giả định (xem Q-RPT1), đổi được bằng tham số.

## Đề xuất thay đổi

Bổ sung định nghĩa mẫu số vào `docs/03` §4 (đã ghi trong Q-RPT1, sửa nhẹ docs/03).

## Complexity tracking

Không có (fast-check đã có trong `packages/shared`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định có trong spec/Q-RPT1).
