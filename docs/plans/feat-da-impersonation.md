# Kế hoạch `feat-da-impersonation` — Chống mạo danh Page/shop (FR-155)

## Việc

Mã gap matrix: `DA-IMPERSONATION` · Spec: FR-155, US-111 (`docs/05`, `docs/04`), `docs/09` §4 bậc 4.

**Tóm tắt:** Thêm hàm thuần `evaluateImpersonation` phát hiện bình luận mạo danh: tên tác giả giống tên Page/shop kèm link/SĐT/"page phụ"/"nhận quà"/số tài khoản, hoặc tự xưng chủ shop/ngân hàng và đòi chuyển khoản. Kết quả nuôi `risks.impersonation` của `decideAction` (đã có → chuyển người, không tự gửi) và trả `suggestHide` chỉ là gợi ý cho người bấm Ẩn. Rủi ro: chặn thừa (an toàn) hoặc bỏ sót biến thể lạ — đầu vào hỏng luôn thiên về chặn; AI/code không bao giờ tự ẩn.

## Điểm chưa rõ

Không có (xem Q-DIM1 ở `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Tên giống (giống hệt, bỏ dấu/hoa thường, hậu tố, ký tự Cyrillic/leet/zero-width, sai ~1 chữ) + tín hiệu → `suspected`; chỉ tên giống hoặc chỉ tín hiệu → không — `impersonation-rules.test.ts`.
2. Tự xưng chủ shop/admin/ngân hàng + đòi chuyển khoản/liên hệ → `suspected` dù tên lạ; "chủ shop ơi" của khách không tự xưng → không.
3. Bình luận do chính Page (`authorIsPage`) bị bỏ qua; đầu vào hỏng/quá dài → `suspected` + `unreadable`, không ném (property `fc.anything()`).
4. Kết quả chỉ có `suspected/reasons/suggestHide/unreadable` — không có hành động ẩn/gửi; `suggestHide ⇒ suspected`.
5. Đơn điệu (chèn chữ không làm hết nghi), thứ tự tên Page không ảnh hưởng — property-based.
6. `decideAction` đã chuyển người khi `risks.impersonation` (test hiện có); coverage `packages/ai` không dưới ngưỡng; `pnpm test:trace` có FR-155.

## File sẽ đọc

`decide/human-hold-rules.ts` (mẫu), `decide/legal-rules.ts` (chuẩn hóa), `decide/decide-action.ts` (chỉ grep rủi ro), `decide/index.ts`.

## File sẽ sửa / tạo

- tạo `packages/ai/src/decide/impersonation-rules.ts` + `.test.ts`; sửa `decide/index.ts`
- docs: plan, `q-dim1.md`, codemap fragment, KT (`kt-dim.md`, `tt-dim.md`), gap-matrix, MASTER, handoff

## Migration

Không có (cột `comments.is_impersonation_suspected` đã có từ migration 0019). Nối pipeline đọc tên tác giả/Page, ghi cột và nhãn → gap `DA-IMPERSONATION-WIRE`.

## Test viết trước

Toàn bộ `impersonation-rules.test.ts` (đỏ vì chưa có file nguồn), kèm fast-check.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/decide/impersonation-rules.test.ts`

## Cần kiểm chứng độc lập không?

Có — nuôi rủi ro của cổng tự gửi và liên quan "AI không tự ẩn": một lần `verifier-security`.

## Rủi ro / câu hỏi cho chủ dự án

Danh sách từ khóa/heuristic cần tinh chỉnh theo dữ liệu thật; chưa bắt chữ số đọc bằng chữ ("không chín một…") và URL viết lách.

## Đề xuất thay đổi

Không sửa `docs/01–16`.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: quyết định đã có trong FR-155; chi tiết Q-DIM1)
