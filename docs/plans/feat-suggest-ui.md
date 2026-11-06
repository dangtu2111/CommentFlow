# Kế hoạch `feat-suggest-ui` — SUGGEST-UI (gợi ý AI, bản gửi, chip nguồn, đổi nhãn)

Mã gap matrix: `SUGGEST-UI` · Spec: FR-043 (`docs/05`), `docs/10` bảng `drafts`, `docs/08` §4 (chi tiết bình luận).

**Tóm tắt:** Trong chi tiết bình luận, hiện ô "Gợi ý của AI" (kèm chip nguồn), nút "Dùng gợi ý" đổ chữ vào hộp soạn; nhân viên sửa rồi gửi. Hàm thuần tính "gửi nguyên văn hay đã sửa" + khoảng cách sửa để sau này ghi vào `drafts` (`final_text`, `edit_distance`, `status`). Thêm ô "Đổi nhãn" cho một bình luận (dùng lại hành động hàng loạt đã có, nhãn ghi `label_source='human'`). **Bảng `drafts` chưa tồn tại** và chỉ làn b được thêm migration → phần LƯU (bản AI + bản gửi vào DB, nối loader gợi ý) ghi vào gap matrix (`SUGGEST-UI-PERSIST`); giao diện nhận gợi ý qua prop, mặc định chưa có dữ liệu thì không hiện.

## Điểm chưa rõ

Không có (Q-SUI1 ghi ở `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. `classifyDraftOutcome` trả `sent_as_is` khi bản gửi trùng bản AI (bỏ khoảng trắng đầu/cuối, chuẩn hóa xuống dòng), `edited` + `editDistance` đúng (ký tự Unicode) khi khác; `editDistance` đối xứng, `d(x,x)=0` — `packages/shared/src/draft-feedback.test.ts` (kể cả property-based).
2. `buildSourceChips` bỏ trùng, giữ thứ tự, cắt nhãn dài, tối đa 5 chip + số còn lại; id không biết tên → nhãn dự phòng — cùng file test.
3. Ô gợi ý chỉ hiện khi có gợi ý; "Dùng gợi ý" điền hộp soạn; hộp soạn báo "đã sửa so với gợi ý" khi chữ khác gợi ý — `apps/web/src/lib/suggestion.test.ts` (logic thuần `deriveSuggestionUi`).
4. Đổi nhãn một bình luận gọi `relabelCommentsAction([id], nhãn)`; nhãn chỉ thuộc bộ chuẩn — `suggestion.test.ts`/test bulk sẵn có; khóa i18n vi/en khớp, `pnpm lint:i18n` xanh.
5. Công cụ: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, coverage `@flow/shared` đạt ngưỡng.

## File sẽ đọc

`reply-composer.tsx`, `comment-detail.tsx`, `actions.ts` (đã đọc); `draft-result.ts` (dạng `sources`); `vi.json`/`en.json` mục `comments`.

## File sẽ sửa / tạo

Tạo: `packages/shared/src/draft-feedback.ts` (+ test), `apps/web/src/lib/suggestion.ts` (+ test), `components/comments/suggestion-panel.tsx`, `components/comments/relabel-select.tsx`. Sửa: `shared/src/index.ts`, `reply-composer.tsx`, `comment-detail.tsx`, `vi.json`/`en.json`, `globals.css` (chip nguồn), docs (gap-matrix, MASTER, codemap, KIEM_TRA_TAY, QUYET_DINH, handoff).

## Migration

Không có. Cần sau (làn b): cột/bảng `drafts` đã spec ở docs/10 — `SUGGEST-UI-PERSIST`.

## Test viết trước

`draft-feedback.test.ts`, `suggestion.test.ts` — viết và chạy đỏ trước mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/draft-feedback.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib/suggestion.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/cổng tự gửi/sendRecheck/migration; không đổi đường gửi).

## Rủi ro / câu hỏi cho chủ dự án

Gợi ý chưa có dữ liệu thật cho tới khi có `drafts` + nối pipeline; giao diện đã sẵn sàng.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định theo spec FR-043 + Q-SUI1).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
