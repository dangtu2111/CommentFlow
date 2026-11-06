# Kế hoạch feat-private-reply — Nhắn riêng từ bình luận

## Việc

Mã gap matrix: `PRIVATE-REPLY` · Spec: FR-046 (docs/05), BR-15 (docs/02), docs/09 §6.1, docs/12 §1.

**Tóm tắt:** Thêm hàm thuần kiểm tra điều kiện TRƯỚC khi nhắn riêng (private reply: tin nhắn gửi riêng cho người đã bình luận) từ một bình luận Facebook: chỉ 1 tin cho mỗi bình luận, trong ≤ 7 ngày kể từ lúc bình luận, đúng người bấm gửi, kênh còn kết nối, còn hạn mức tốc độ. Mỗi lần bị chặn trả về mã lý do + nhãn tiếng Việt để giao diện hiển thị sau. Chưa có giao diện, chưa gọi Meta thật, không migration (cột "đã nhắn riêng" cần bảng → ghi gap cho làn b).

## Điểm chưa rõ

Không có. (Tự chọn: AI không tự gửi private reply — Q-PRP1.)

## Tiêu chí nghiệm thu

1. Bình luận Facebook ≤ 7 ngày, chưa nhắn riêng, người bấm gửi, kênh ổn → cho phép (`ok`) — test ví dụ + property.
2. Đúng 7 ngày cho phép; 7 ngày + 1 ms chặn `window_expired` — test biên.
3. Đã nhắn riêng một lần → luôn chặn `already_sent`, bất kể điều kiện khác — property.
4. IG/TikTok chặn `platform_unsupported`; bình luận xóa/gộp/ẩn, kênh mất kết nối/tạm khóa, chế độ tự động, tin rỗng/quá dài, hết hạn mức → chặn đúng mã, đúng thứ tự P1–P8 — test từng nhánh.
5. Mọi mã lý do có nhãn tiếng Việt; đầu vào hỏng không ném, trả chặn `input_unreadable` — test + property.
6. Kết quả khớp `evaluateAction` của connector Facebook (7 ngày, oncePerTarget) — đối chiếu bằng hằng số/test.

## File sẽ đọc

`packages/ai/src/recheck/send-recheck.ts` (mẫu), `packages/connectors/src/capabilities.ts`, `declarations.ts`, docs/09 §6.1.

## File sẽ sửa / tạo

- `packages/ai/src/private-reply/{index.ts,private-reply-check.ts,private-reply-check.test.ts}` (mới)
- `packages/ai/src/index.ts` (một dòng export module mới)
- `docs/plans/quyet-dinh/qprp1.md`, `docs/codemap.d/…`, `docs/can-ban-cung-cap.d/…`, `docs/testing/kiem-tra-tay.d/{kt,tt}-prp.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md` (dòng của việc), `docs/handoff/feat-private-reply.md`

## Migration

Không có (chỉ làn b). Cần sau này: cột/bảng ghi "đã nhắn riêng" (`private_replied_at`/`comment_private_replies`) + `automation_events` — ghi vào gap `PRIVATE-REPLY-WIRE`.

## Test viết trước

Toàn bộ `private-reply-check.test.ts` (ví dụ, biên, property bằng fast-check) viết đỏ trước.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/private-reply` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — chạm `sendRecheck`-họ hàng/cổng gửi: một lần `verifier-security`.

## Rủi ro / câu hỏi cho chủ dự án

Luật Meta "7 ngày, 1 tin" lấy từ docs/12 (đã `verified`); cần thử thật ở staging khi có Page (KT-PRP).

## Đề xuất thay đổi

Không sửa docs/01–16.

## Complexity tracking

Không có. (Không import `@flow/connectors` vào `@flow/ai` để khỏi thêm phụ thuộc; hằng số 7 ngày khớp khai báo connector, có test đối chiếu ở phía kiểm tay.)

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR; mục tự chọn ghi Q-PRP1).
