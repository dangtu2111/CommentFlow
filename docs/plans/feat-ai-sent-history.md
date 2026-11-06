# Kế hoạch `feat-ai-sent-history` — Lịch sử AI đã gửi + Đánh dấu sai

## Việc

Mã gap matrix: `AI-SENT-HISTORY` · Spec: FR-075, docs/07 dòng 86, docs/09 §11.2 (ngưỡng "Đánh dấu sai"), docs/13 §3 (Owner + Staff đều được Đánh dấu sai).

**Tóm tắt:** Thêm trang "AI đã gửi" liệt kê các câu AI đã tự gửi, kèm nút **Đánh dấu sai** (Owner và Staff). Repo CHƯA có bảng `drafts`/`automation_events` (cần migration, chỉ làn b) nên làm trước phần không cần bảng: quy tắc thuần (ai được đánh dấu, đánh dấu lặp, tỷ lệ sai làm tín hiệu tạm dừng tự gửi), giao diện `AutoSentHistoryStore` + bản trong bộ nhớ (fixture cho test), trang web + i18n vi/en. Trang chạy trên store rỗng (không dữ liệu giả) cho tới khi có bảng thật. Rủi ro thấp: không chạm gửi tin, không migration.

## Điểm chưa rõ

Không có (xem Q-ASH1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. `decideMarkWrong`: bản ghi `sent` → `marked_wrong` kèm người + giờ + lý do đã trim; lần hai → `already_marked`, không đổi dữ liệu; lý do > 300 ký tự → `reason_too_long`; vai trò lạ → `forbidden` — kiểm bằng `history/mark-wrong.test.ts`.
2. `evaluateMarkedWrongSignal`: > 10% VÀ ≥ 10 câu trong 1 giờ → `pause`; đúng 10% hoặc 9 câu → không; chỉ tính câu gửi trong cửa sổ — `history/marked-wrong-signal.test.ts`.
3. Store trong bộ nhớ: liệt kê chỉ workspace của mình, mới nhất trước, lọc trạng thái, phân trang; `markWrong` id workspace khác → `not_found` — `history/memory-store.test.ts`.
4. Server Action đánh dấu: id lạ/workspace khác → 404; form được kiểm chặt; khóa i18n vi/en khớp, `lint:i18n` đạt — `server/ai-sent-history.test.ts`, `lib/ai-sent-form.test.ts`, `i18n/messages.test.ts`.
5. Menu "AI đã gửi" cho cả Owner và Staff — `lib/app-nav.test.ts`.
6. Mọi công cụ phạm vi đổi xanh, coverage `packages/ai` không hạ ngưỡng — lệnh ở mục dưới.

## File sẽ đọc

Đã đọc: gap-matrix/MASTER, docs 09 §11.2, schema `comment-replies.ts`, `kb-gaps` (server/trang/action/row), `app-nav.ts`, `ai/src/index.ts`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/history/{auto-sent-record,mark-wrong,marked-wrong-signal,memory-store}.ts` + test; sửa `packages/ai/src/index.ts`.
- Tạo `apps/web/src/lib/ai-sent-form.ts` (+test), `server/ai-sent-history.ts` (+test), `app/app/(guarded)/ai-sent/{page.tsx,actions.ts}`, `components/ai-sent/ai-sent-row.tsx`.
- Sửa `lib/app-nav.ts` (+test), `packages/shared/src/i18n/messages/{vi,en}.json`.
- Docs: gap-matrix, MASTER, codemap (dòng riêng), `QUYET_DINH_CHO_DUYET.md`, `KIEM_TRA_TAY.md`, handoff.

## Migration

Không có. Phần cần bảng/cột (`drafts.status=auto_sent`, `automation_events` `marked_wrong`) → gap matrix `AI-SENT-HISTORY-DB` (làn b).

## Test viết trước

Toàn bộ logic quy tắc ở trên (TDD, test đỏ trước).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/history` · `pnpm --filter @flow/web exec vitest run src/lib src/server src/i18n` · `pnpm --filter @flow/ai test:coverage`.

## Cần kiểm chứng độc lập không?

Không (không chạm cổng tự gửi/`sendRecheck`/RLS/migration; chỉ đọc + đánh dấu qua store trừu tượng).

## Rủi ro / câu hỏi cho chủ dự án

Trang trống tới khi có DB thật + pipeline tự gửi; nút Đánh dấu sai chưa ghi bền (store bộ nhớ) — đã nêu ở gap matrix.

## Đề xuất thay đổi

Không.

## Complexity tracking

Interface `AutoSentHistoryStore` khi mới có 1 hiện thực (bộ nhớ): đi ngược "không trừu tượng hóa sớm" — cần vì phần DB phải cắm sau migration làn b mà web phải chạy được ngay (như `TryKnowledge`); phương án đơn giản hơn (gọi thẳng DB) bị loại vì chưa có bảng.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc Q-ASH1).
