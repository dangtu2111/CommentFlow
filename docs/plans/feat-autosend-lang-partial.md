# Kế hoạch `feat-autosend-lang-partial` — Tự gửi theo ngôn ngữ + hỏi lại/chuyển hướng

Mã gap matrix: `AUTOSEND-LANG-PARTIAL` · Spec: FR-120, FR-147, `docs/09` §5, §6 (đoạn "Song ngữ").

**Tóm tắt:** Thêm lớp mỏng quanh cổng tự gửi `decideAutoSend` để mức Tự động, ngưỡng và giới hạn/ngày tra theo (kênh, nhãn, **ngôn ngữ**); ngôn ngữ chưa đạt bộ đánh giá không được Tự động (chỉ Chạy thử); ngôn ngữ ngoài vi/en và câu nháp lệch ngôn ngữ trả lời thì không tự gửi. Câu hỏi lại/chuyển hướng không có ý sự kiện tự gửi được qua `allow_clarify` (cổng đã có) — thêm test đủ ca cho cả hai ngôn ngữ. Lớp này chỉ CHẶN thêm, không mở cổng; không có đường ẩn bình luận. Cột `automation_settings.lang` ở DB thuộc làn b (không migration ở đây).

## Điểm chưa rõ

Không có. (Quyết định tự chọn: Q-ALP1.)

## Tiêu chí nghiệm thu

1. Mức tra theo ngôn ngữ: ô riêng `vi`/`en` thắng ô `all`; không có ô → `off`; ngôn ngữ `other` → `off` — test đơn vị.
2. Ngưỡng/giới hạn riêng theo ngôn ngữ; ngưỡng không bao giờ thấp hơn sàn 0,80 — test + property.
3. Ngôn ngữ chưa đạt đánh giá: `auto` → chỉ `would_send`, không bao giờ `auto_send` — test + property.
4. Ngôn ngữ trả lời: kênh cố định `vi`/`en` thắng; `other` luôn giữ `other` → hold; `draft.lang` lệch → hold — test.
5. `auto_send` kéo theo mọi điều kiện ngôn ngữ thỏa VÀ cổng gốc cho `auto_send` — property (không mở cổng).
6. Hỏi lại/chuyển hướng (vi, en): tự gửi khi `allow_clarify` bật và không có ý `fact`; chặn khi tắt; có `fact` cần `allow_partial`; `handoff` không bao giờ — test.
7. Đầu vào hỏng không ném, về `hold` — property.

## File sẽ đọc

`packages/ai/src/gate/auto-send-gate.ts` (đã đọc), `automation/settings.ts` (đã đọc), `normalize/normalize-lang.ts` (kiểu `DetectedLang`), `docs/09` §5–6.

## File sẽ sửa / tạo

- tạo `packages/ai/src/gate/lang-autosend.ts` + `lang-autosend.test.ts`; sửa `packages/ai/src/gate/index.ts` (export)
- `docs/codemap.d/…`, `docs/plans/quyet-dinh/qalp1.md`, `docs/testing/kiem-tra-tay.d/kt-alp1.md` + `tt-alp1.md`, dòng gap-matrix/MASTER, handoff

## Migration

Không có. Cột `automation_settings.lang` / `channels.reply_language` đọc ở bước nối DB (làn b) — ghi vào gap matrix.

## Test viết trước

Toàn bộ `lang-autosend.test.ts` (ví dụ + fast-check) viết trước khi có mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/gate/lang-autosend.test.ts` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — chạm cổng tự gửi: `verifier-security` một lần cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

Chưa nối pipeline/DB (làn b + PIPE-ROUTE); lớp này chưa chạy thật.

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
