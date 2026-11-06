# Kế hoạch `feat-kb-gaps-ui` — Câu hỏi AI chưa trả lời được + bổ sung kiến thức nhanh

## Việc

Mã gap matrix: `KB-GAPS-UI` · Spec: FR-134, FR-141 (phần hiển thị), UF-11, US-106.

**Tóm tắt:** Thêm trang `/app/kb-gaps` (chỉ Owner) liệt kê các câu khách hỏi mà AI chưa trả lời được (bảng `kb_gaps` đã có từ RETRIEVAL-LOG), gom theo chủ đề, kèm số lần hỏi và câu ví dụ đã che PII. Mỗi dòng có ô "Bổ sung" (viết câu trả lời → lưu thành FAQ và đánh dấu đã xử lý) và nút "Bỏ qua"/"Mở lại". Không thêm migration. Rủi ro thấp: chỉ dùng hàm DB đã có, qua `withActor` (RLS theo workspace).

## Điểm chưa rõ

Không có (xem Q-KG1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Bộ lọc `topic`/`status` từ URL được kiểm chặt, giá trị lạ bị bỏ, mặc định `status=open` — `lib/kb-gaps-form.test.ts`.
2. Form kiểm đầu vào (id UUID, ý định resolve/ignore/reopen, câu hỏi + câu trả lời bắt buộc khi resolve, ngôn ngữ) — cùng file test.
3. Gom nhóm theo chủ đề giữ thứ tự nhiều lần hỏi nhất trước và cộng đúng tổng — cùng file test.
4. Bổ sung: một giao dịch `withActor` đổi gap → `resolved` rồi tạo FAQ; gap không thấy được (workspace khác) → 404, không tạo FAQ — `server/kb-gaps.test.ts` (db giả).
5. Trang chỉ Owner (Staff 404), menu chỉ hiện cho Owner — `app-nav.test.ts`, test quét `requireAppUser`.
6. Mọi chuỗi có vi + en, mọi chủ đề `KB_GAP_TOPICS` có nhãn — test khóa i18n; `pnpm lint:i18n`.
7. Công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`packages/db/src/retrieval-logs.ts` (đã đọc), `queries/kb-content.ts`, `shared/kb-content.ts`, `shared/retrieval-log.ts`, readiness page/server (mẫu), `lib/app-nav.ts`, messages vi/en.

## File sẽ sửa / tạo

- tạo `apps/web/src/lib/kb-gaps-form.ts` (+test): lọc, parse form, gom nhóm (thuần).
- tạo `apps/web/src/server/kb-gaps.ts` (+test): `loadKbGaps`, `applyKbGapAction`.
- tạo `apps/web/src/app/app/(guarded)/kb-gaps/{page.tsx,actions.ts}`, `components/kb-gaps/kb-gaps-list.tsx`.
- sửa `lib/app-nav.ts` (+test), `packages/shared/src/i18n/messages/{vi,en}.json`, docs (codemap dòng riêng, gap-matrix, MASTER, CAN_BAN_CUNG_CAP, KIEM_TRA_TAY, QUYET_DINH, handoff).

## Migration

Không có.

## Test viết trước

Tiêu chí 1–4, 6 (viết trước, thấy đỏ).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/kb-gaps-form.test.ts src/server/kb-gaps.test.ts src/lib/app-nav.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/thanh toán/cổng tự gửi; ghi FAQ qua RLS Owner sẵn có).

## Rủi ro / câu hỏi cho chủ dự án

Phần còn lại ghi vào gap matrix: nơi GHI `kb_gaps` (RETRIEVAL-LOG-WIRE), mở đúng mục Chính sách/Bảng size/thẻ sản phẩm (cần KB-CONTENT-UI), "Xuất bản → resolved" (cần luồng kb_versions), API `/kb/gaps`, lọc theo sản phẩm (cần danh sách sản phẩm).

## Đề xuất thay đổi

docs/07 UF-11 bước 3: bản này đánh dấu `resolved` ngay khi lưu FAQ (Q-KG1).

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

Không có bảng mới.

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi ở Q-KG1).
