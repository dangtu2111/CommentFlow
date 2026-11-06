# Kế hoạch `feat-data-priority` — Thứ tự ưu tiên dữ liệu khi trả lời

## Việc

Mã gap matrix: `DATA-PRIORITY` · Spec: FR-063 (docs/05), docs/09 §4 (retrieve).

**Tóm tắt:** Khi soạn câu trả lời, nguồn dữ liệu phải xếp theo thứ tự: ghi chú của bài → sản phẩm gắn bài (giá/tồn từ DB) → kiến thức FAQ/chính sách → thông tin chung của cửa hàng. Làm phần thuần (không DB, không migration): chuyển ghi chú bài còn hiệu lực thành nguồn, xếp nguồn theo bậc ưu tiên, nối vào `retrieveKnowledge`. Rủi ro: ghi chú do shop nhập nên vẫn quét cài lệnh (FR-164) và không bao giờ bỏ qua giá/tồn từ DB.

## Điểm chưa rõ

Không có. Tự chọn (Q-DP1): bậc cố định `post_note < product < policy < kb`; trong cùng bậc ghi chú mới (validFrom lớn hơn) trước; ghi chú hết hạn/chưa tới hạn bị loại; ghi chú tối đa 1.500 token.

## Tiêu chí nghiệm thu

1. Ghi chú còn hiệu lực thành nguồn `post_note` đứng TRƯỚC sản phẩm, sản phẩm trước kiến thức — kiểm bằng `data-priority.test.ts` + `retrieve.test.ts`.
2. Ghi chú hết hạn/chưa tới hạn không vào nguồn (đúng biên `validTo`) — test biên.
3. Ghi chú nghi cài lệnh bị cách ly, không vào prompt — test.
4. Property: thứ tự bậc luôn không giảm; hoán vị đầu vào không đổi dãy bậc; không mất/không thêm nguồn; xếp lũy đẳng — fast-check.
5. Ghi chú vượt trần token bị cắt và đánh dấu `truncated`; giá/tồn không bị ghi chú làm mất — test.

## File sẽ đọc

`retrieve/sources.ts`, `retrieve/retrieve.ts`, `draft/draft-prompt.ts` (kiểu `DraftSource`), `shared/src/post-notes.ts` (`postNoteStatus`).

## File sẽ sửa / tạo

- `packages/ai/src/retrieve/data-priority.ts` (mới) · `data-priority.test.ts` (mới)
- `packages/ai/src/retrieve/retrieve.ts` (nhận `postNotes`, `now`; xếp theo bậc) · `retrieve.test.ts`
- `docs/codemap.d/`, `docs/plans/quyet-dinh/qdp1.md`, dòng DATA-PRIORITY của gap-matrix/MASTER, handoff.

## Migration

Không có.

## Test viết trước

Toàn bộ `data-priority.test.ts` (đỏ trước khi có module).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/retrieve`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/cổng gửi/PII; quét cài lệnh dùng hàm có sẵn).

## Rủi ro / câu hỏi cho chủ dự án

Còn lại ngoài phạm vi: nối truy vấn ghi chú từ DB vào pipeline (khi PIPE-RETRIEVE được nối) và quy tắc prompt "nguồn đứng trước thắng khi mâu thuẫn" (đổi `draft@N`, thuộc AI-EVAL).

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec FR-063 + Q-DP1).
