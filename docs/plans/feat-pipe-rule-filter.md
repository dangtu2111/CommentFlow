# Kế hoạch `feat-pipe-rule-filter` — Lọc quy tắc trước AI + gộp bình luận liên tiếp (PIPE-RULE-FILTER, PIPE-MERGE-BURST)

## Việc

Mã gap matrix: `PIPE-RULE-FILTER` (FR-024) rồi `PIPE-MERGE-BURST` (FR-148, US-109) · Spec: `docs/05` FR-024/148, `docs/09` §7.1a, `docs/10` `comments.merged_into_id` + `automation_settings.merge_window_seconds`.

**Tóm tắt:** Thêm hai hàm thuần (không DB, không LLM) vào `packages/shared`. (1) `ruleFilter`: bình luận chỉ gồm emoji/sticker/tag/dấu chấm → "Bỏ qua", không gọi AI và không trừ lượt. (2) `planMergeBurst`: gom các bình luận cùng khách + cùng bài cách nhau < cửa sổ (mặc định 30 giây, Owner chỉnh 10–60) thành một lượt, trả lời vào bình luận cuối. Rủi ro: lọc quá tay làm mất câu hỏi thật (nên chọn thận trọng: có chữ/số/ảnh/video/dấu "?" thì không bỏ qua); ghi `merged_into_id` cần hàm DB riêng (cần migration của làn b) nên chưa nối.

## Điểm chưa rõ

Không có. Lựa chọn tự chốt: Q-PRF1 (rule filter), Q-PMB1 (merge burst) trong `QUYET_DINH_CHO_DUYET.md`.

## Tiêu chí nghiệm thu

1. Văn bản chỉ gồm emoji (kể cả ghép ZWJ, màu da, cờ), khoảng trắng, dấu chấm/phẩy/gạch/chấm than, hoặc tag `@Tên` → `skip` với lý do tương ứng — kiểm bằng: test đơn vị FR-024.
2. Có chữ, chữ số, "?", ký hiệu `+`/`$`, hoặc ảnh/video đính kèm → KHÔNG bỏ qua (an toàn: đẩy tiếp cho AI/người) — kiểm bằng: test đơn vị + vòng kiểm tất định (mỗi chữ cái ghép emoji không bao giờ bị bỏ qua).
3. Tệp sticker/gif và không có chữ → `skip` lý do `sticker`; không có text + không tệp → `skip` `empty` — kiểm bằng: test đơn vị.
4. Tag theo `mentions` (offset/length từ Graph, dữ liệu không tin cậy: offset sai bị bỏ qua, không ném) và theo mẫu `@[id:0:Tên]`/`@Tên`; email `a@b.com` không bị coi là tag — kiểm bằng: test đơn vị.
5. `planMergeBurst`: cùng khách + cùng bài, khoảng cách liên tiếp < cửa sổ (đúng ngưỡng không gộp) → một nhóm; khác khách/bài tách; sắp theo thời gian; bình luận đích = bình luận cuối; nhóm tối đa 10 bình luận — kiểm bằng: test đơn vị + vòng kiểm tất định (không phụ thuộc thứ tự đầu vào, mỗi id đúng một nhóm).
6. Cửa sổ ép về 10–60 giây (không hợp lệ → 30); `isBurstReady(group, now)` chỉ đúng khi `now ≥ bình luận cuối + cửa sổ`; `burstKey` chứa workspace_id — kiểm bằng: test đơn vị.
7. `mergeBurstText` ghép chữ theo thứ tự thời gian, bỏ phần rỗng — kiểm bằng: test đơn vị.
8. Ngưỡng coverage `packages/shared` không hạ — kiểm bằng: `pnpm --filter @flow/shared test:coverage`.

## File sẽ đọc

`packages/shared/{vitest.config.ts,src/index.ts,src/comment-labels.ts}` (kiểu/bố cục), `docs/09` §7.1a, `docs/05` FR-024/148 — đã đọc.

## File sẽ sửa / tạo

- `packages/shared/src/rule-filter.ts` + `rule-filter.test.ts` (mới).
- `packages/shared/src/merge-burst.ts` + `merge-burst.test.ts` (mới).
- `packages/shared/src/index.ts`: xuất API.
- Docs: `QUYET_DINH_CHO_DUYET.md`, `gap-matrix.md`, `MASTER.md`, `codemap.md`, `CAN_BAN_CUNG_CAP.md` (không cần tài nguyên), `testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-pipe-rule-filter.md`.

## Migration

Không có (làn c). Phần cần migration (hàm DEFINER ghi `merged_into_id`, đọc `merge_window_seconds` theo kênh/nhãn) ghi vào gap matrix.

## Test viết trước

Hai file `*.test.ts` viết và chạy đỏ (module chưa có) trước khi viết mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/rule-filter.test.ts src/merge-burst.test.ts` · `pnpm --filter @flow/shared test:coverage`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/cổng tự gửi/PII; hàm thuần, thận trọng theo hướng không bỏ qua).

## Rủi ro / câu hỏi cho chủ dự án

Chưa nối vào `ingest`/pipeline (chưa có job `process`, PIPE-ROUTE…); nối khi có. Không cần tài nguyên ngoài.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có (không thư viện mới; không thêm `fast-check` vào `shared`, dùng vòng kiểm tất định).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ghi ở QUYET_DINH_CHO_DUYET.md; không còn thẻ chưa rõ).
