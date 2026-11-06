# Kế hoạch `feat-auto-hide` — Tự ẩn bình luận chứa SĐT/link (FR-081)

## Việc

Mã gap matrix: `AUTO-HIDE` · Spec: `docs/05` FR-081, `docs/03` M09, `docs/10` bảng `rules`, ADR 009.

**Tóm tắt:** Làm phần LOGIC THUẦN của "Tự ẩn": hàm quyết định có ẩn một bình luận hay không (chỉ khi bình luận chứa SĐT hoặc link VÀ có quy tắc Tự ẩn đang bật), rồi quy trình "lưu khách tiềm năng TRƯỚC, ẩn SAU" qua interface (`ContactSink`, `HideRequester`). Quyết định do code, AI không bao giờ tự ẩn. Cờ `AUTO_HIDE_ENABLED` mặc định TẮT. Phần DB (cho phép `auto_hide` trong bảng `rules`, hàm DEFINER yêu cầu ẩn cho hệ thống) cần migration → ghi vào gap matrix, không làm ở làn này.

## Điểm chưa rõ

Không có. (Tự chọn, ghi `QAH1`: lưu khách lỗi → KHÔNG ẩn, giữ lại cho người xử lý; quy tắc có `shadow_until` chưa hết hạn → chỉ ghi "sẽ ẩn", không ẩn; chỉ ẩn bình luận ở trạng thái chưa xử lý.)

## Tiêu chí nghiệm thu

1. Bình luận có SĐT/link + quy tắc Tự ẩn bật + cờ bật → quyết định `hide`; thiếu một trong ba → không ẩn — kiểm bằng `auto-hide.test.ts` (mỗi nhánh một test).
2. Quyết định KHÔNG phụ thuộc nhãn/độ tin cậy/điểm của AI (thêm trường lạ vào đầu vào không đổi kết quả; nhãn spam mà không có SĐT/link → không ẩn) — property-based (fast-check).
3. Bình luận của Page, đã xóa, đã ẩn, hoặc không ở trạng thái chưa xử lý → không ẩn — test.
4. Quy tắc `shadow_until` chưa hết hạn → `would_hide`, không gọi `requestHide` — test.
5. Lưu khách được gọi và xong TRƯỚC khi gọi yêu cầu ẩn; lưu lỗi → không gọi yêu cầu ẩn, kết quả `held` không chứa PII — test thứ tự gọi.
6. Yêu cầu ẩn ném lỗi → kết quả `hide_failed` chỉ có mã, không có nội dung/PII — test.
7. Cờ `AUTO_HIDE_ENABLED` chỉ đúng chữ `true` mới bật; tên biến nằm trong `env.example` — test + `pnpm lint`.
8. Chỉ loại quy tắc `phone`/`link` được Tự ẩn; loại khác bị bỏ qua — test.

## File sẽ đọc

`docs/codemap.md` (đã), `packages/shared/src/spam-rules.ts` (matchSpamRule), `packages/ai/src/pii/mask-pipe.ts` (ContactSink, maskAndCapture), `packages/db/src/hides.ts` (hợp đồng yêu cầu ẩn), `docs/10` bảng `rules`.

## File sẽ sửa / tạo

- `packages/ai/src/autohide/auto-hide.ts` (+ `.test.ts`, `index.ts`): quyết định + quy trình lưu-rồi-ẩn.
- `packages/ai/src/index.ts`: một dòng `export * from './autohide'`.
- `env.example`: `AUTO_HIDE_ENABLED=`.
- `docs/…`: quyết định `qah1`, codemap.d, can-ban-cung-cap.d, kiem-tra-tay.d (KT-AH), gap-matrix, MASTER, handoff.

## Migration

Không có (chỉ làn b). Phần còn lại ghi vào gap matrix: `AUTO-HIDE-DB` (CHECK `rules.action` thêm `auto_hide`; hàm DEFINER cho `withJob` yêu cầu ẩn với `requested_by` null; ghi `action_logs`), `AUTO-HIDE-WIRE` (nối pipeline `process`).

## Test viết trước

`auto-hide.test.ts` viết và chạy đỏ (module chưa tồn tại) trước khi viết mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/autohide` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (đường tự ẩn, nguyên tắc "AI không tự ẩn", PII).

## Rủi ro / câu hỏi cho chủ dự án

Ẩn nhầm bình luận hợp lệ chứa số/link: giảm bằng `shadow_until`, chỉ phone/link, đảo ngược được (bỏ ẩn tay). Chưa nối thật nên chưa có tác động.

## Đề xuất thay đổi

Không sửa docs/01–16; `docs/10` đã ghi `auto_hide` thêm ở migration riêng.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định đã có trong spec/ADR; lựa chọn an toàn ghi QAH1).
