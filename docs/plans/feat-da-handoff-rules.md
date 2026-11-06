# Kế hoạch `feat-da-handoff-rules` — Quy tắc chuyển người cho ảnh/video/sticker kèm chữ (FR-143)

## Việc

Mã gap matrix: `DA-HANDOFF-RULES` · Spec: FR-143 (`docs/05`), `docs/09` §6 mục 6, §4.

**Tóm tắt:** Hiện `decideAction` chỉ tin cờ `refers_to_image` do model đánh dấu. Việc này thêm quy tắc **do code** nhìn loại tệp đính kèm + câu chữ: bình luận có ảnh/video mà chữ chỉ vào ảnh ("mẫu này", "giá?") và chưa nhận ra sản phẩm → chuyển người, lý do `image_product` ("Có ảnh, chưa nhận ra sản phẩm"). Sticker/GIF không phải bằng chứng sản phẩm. Rủi ro: quy tắc quá rộng làm nhiều bình luận cần người — đã chọn thiên về chặn (an toàn); sản phẩm đã nhận từ bài thì không chặn.

## Điểm chưa rõ

Không có (xem Q-DHR1 ở `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. `evaluateAttachmentRules` thuần: ảnh/video + chữ chỉ định ("mẫu này", "trong ảnh", "this one") hoặc chữ ≤ 4 từ → `imageDependent`; sticker/GIF một mình không; không tệp → chỉ theo cờ model — kiểm bằng `handoff-rules.test.ts`.
2. Cờ model `refers_to_image=true` luôn giữ (code chỉ thêm, không bỏ) — property-based.
3. `decideAction` nhận `comment{text,attachmentTypes}` tùy chọn: ảnh phụ thuộc + chưa nhận sản phẩm (0 hoặc >1 ứng viên) → `clarify` + `needsHuman` + `autoSendPolicy=never` + `reason=image_product`; đã nhận đúng 1 sản phẩm → không chặn — kiểm bằng `decide-action.test.ts`.
4. Không có `comment` → hành vi cũ không đổi (test cũ xanh).
5. Đầu vào `comment` hỏng → `handoff` (không ném).
6. Coverage `packages/ai` không dưới ngưỡng; `pnpm test:trace` có FR-143.

## File sẽ đọc

`decide-action.ts` (+test), `stock-rules.ts` (mẫu), `shared/rule-filter.ts` (loại sticker/gif), `foldText` của shared.

## File sẽ sửa / tạo

- tạo `packages/ai/src/decide/handoff-rules.ts` + `.test.ts`
- sửa `decide-action.ts` (+test), `packages/ai/src/index.ts` (export)
- docs: gap-matrix, MASTER, codemap (fragment), QUYET_DINH, KIEM_TRA_TAY, CAN_BAN_CUNG_CAP

## Migration

Không có. Phần cần DB/nối pipeline (ghi `drafts.action`/lý do) ghi gap `DA-HANDOFF-WIRE`.

## Test viết trước

Toàn bộ `handoff-rules.test.ts` + ca mới của `decide-action.test.ts` (đỏ trước), kèm fast-check (đã cài, MIT).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/decide`

## Cần kiểm chứng độc lập không?

Có — chạm `decideAction` (cổng chuyển người/tự gửi): một lần `verifier-security`.

## Rủi ro / câu hỏi cho chủ dự án

Danh sách từ chỉ định tiếng Việt/Anh là heuristic; tinh chỉnh bằng dữ liệu thật sau (không đọc ảnh — `ATTACH-VISION` GĐ5).

## Đề xuất thay đổi

Không sửa `docs/01–16`.

## Complexity tracking

Không có (không thư viện mới, không tầng trừu tượng mới).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định đã có trong FR-143/§6; chi tiết Q-DHR1)
