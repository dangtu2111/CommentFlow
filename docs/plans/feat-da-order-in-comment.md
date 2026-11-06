# Kế hoạch `feat-da-order-in-comment` — Đặt hàng ngay trong bình luận (FR-156)

## Việc

Mã gap matrix: `DA-ORDER-IN-COMMENT` · Spec: FR-156 (+FR-157 phần đã có ở `DA-RULES-STOCK`), US-112 (`docs/05`, `docs/04`), `docs/09` §4/§6, FR-033/FR-082.

**Tóm tắt:** Khách chốt đơn ngay dưới bài (để SĐT/địa chỉ). Thêm hàm thuần phát hiện việc này, lưu khách tiềm năng TRƯỚC khi che (dùng `maskAndCapture`), rồi chỉ trả về câu công khai CỐ ĐỊNH, không lặp lại SĐT/địa chỉ ("Shop đã nhận… sẽ inbox xác nhận") và chuyển hướng sang tin nhắn riêng. Ẩn bình luận chỉ là GỢI Ý cho người bấm; module không có đường ra lệnh ẩn. Rủi ro: bỏ sót cách viết lạ (an toàn: rơi về luồng thường + auto-hide/PII sẵn có), chặn thừa.

## Điểm chưa rõ

Không có (xem Q-DOC1 ở `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. SĐT hoặc địa chỉ + ý đặt/chốt (từ khóa hoặc cờ `order_intent` của extract) → `detected`; chỉ SĐT/địa chỉ không ý đặt, hoặc chỉ ý đặt không liên hệ → không — `order-comment-rules.test.ts`.
2. Chống né: SĐT cách chấm/khoảng trắng/chữ toàn khổ/zero-width vẫn nhận; Page tự viết bị bỏ qua; đầu vào hỏng/quá dài → `unreadable`, không ném (property `fc.anything()`).
3. `handleOrderInComment`: lưu khách TRƯỚC (thứ tự gọi kiểm bằng spy); lưu lỗi → `held`, KHÔNG có câu trả lời công khai, không lộ SĐT trong kết quả/lỗi.
4. Câu công khai là mẫu cố định (vi/en), không chứa SĐT/email/địa chỉ/chữ số của khách — property: với mọi bình luận, `checkOrderReplyLeak` đạt; lang `other` → không có câu, chuyển người.
5. Kết quả không có trường/hàm ẩn; `suggestHide ⇒ detected`; `autoSendPolicy = 'never'` giai đoạn này.
6. Coverage `packages/ai` không dưới ngưỡng; `pnpm test:trace` có FR-156.

## File sẽ đọc

`decide/impersonation-rules.ts` (mẫu), `pii/mask-pipe.ts`, `autohide/auto-hide.ts` (mẫu lưu-trước-ẩn-sau), `shared/pii.ts`.

## File sẽ sửa / tạo

- tạo `packages/ai/src/decide/order-comment-rules.ts` + `.test.ts`; sửa `decide/index.ts`
- docs: plan, `q-doc1.md`, codemap fragment, KT (`kt-doc.md`, `tt-doc.md`), gap-matrix, MASTER, handoff

## Migration

Không có (chỉ làn b). Lưu địa chỉ/sản phẩm/số lượng vào `cf.leads` cần cột/bảng mới → gap `DA-ORDER-IN-COMMENT-DB`; nối pipeline → `DA-ORDER-IN-COMMENT-WIRE`.

## Test viết trước

Toàn bộ `order-comment-rules.test.ts` (đỏ vì chưa có nguồn), kèm fast-check.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/decide/order-comment-rules.test.ts`

## Cần kiểm chứng độc lập không?

Có — chạm che PII và liên quan "AI không tự ẩn": một lần `verifier-security`.

## Rủi ro / câu hỏi cho chủ dự án

Heuristic địa chỉ/từ khóa cần tinh chỉnh theo dữ liệu thật; chưa bắt SĐT đọc bằng chữ.

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

Đã duyệt (tự duyệt: quyết định đã có trong FR-156; chi tiết Q-DOC1)
