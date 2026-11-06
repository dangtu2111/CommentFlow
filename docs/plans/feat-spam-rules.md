# Kế hoạch `feat-spam-rules` — Quy tắc spam + xem trước 7 ngày

## Việc

Mã gap matrix: `SPAM-RULES` · Spec: docs/05 FR-080, docs/04 US-050, docs/07 UF-4, docs/10 §3.5 (`rules`, `rule_matches`).

**Tóm tắt:** Owner tạo quy tắc spam (từ khóa, mẫu regex, số điện thoại, link, chỉ emoji, chỉ tag) và bấm **Xem trước** để biết quy tắc sẽ khớp bao nhiêu bình luận trong 7 ngày qua (đọc thật, không đổi gì). Quy tắc chỉ **đánh dấu/bỏ qua**; AI không bao giờ tự ẩn, và mức "Tự ẩn" là việc riêng (`AUTO-HIDE`). Bảng `rules` chưa có (migration chỉ làn b) nên **lưu quy tắc** làm sau interface, hiện trả "chưa khả dụng". Rủi ro: regex do người dùng nhập có thể chạy chậm → giới hạn độ dài/độ phức tạp và cắt văn bản.

## Điểm chưa rõ

Không có (xem Q-SPR1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Zod kiểm quy tắc: tên ≤ 80, mẫu ≤ 200, loại ∈ 6 loại, hành động chỉ `mark`/`skip` (`auto_hide` bị từ chối) — kiểm bằng test `spam-rules.test.ts`.
2. `matchSpamRule` khớp đúng từng loại (từ khóa không dấu/hoa thường, regex, SĐT VN, link, emoji-only, tag-only) và regex nguy hiểm/không hợp lệ bị từ chối khi kiểm — test.
3. `previewSpamRule` đếm khớp trên bình luận 7 ngày, bỏ bình luận của Page (`is_own`) và đã xóa, trả tối đa N ví dụ đã che PII — test.
4. Trang `/app/spam-rules` chỉ Owner (Staff 404); Xem trước đọc `comments` của workspace hiện tại qua `withActor`, không lộ workspace khác — test truy vấn tích hợp + test dịch vụ.
5. Lưu quy tắc trả `unavailable` (chưa có bảng), giao diện báo rõ, không ghi gì — test dịch vụ.
6. Chuỗi vi/en đủ khóa, `lint:i18n` đạt; mục menu "Quy tắc spam" chỉ Owner — test.

## File sẽ đọc

`docs/codemap.md`, `rule-filter.ts`, `kb-gaps` (page/actions/server/form/row) làm mẫu, `app-nav.ts`, `retrieval-logs.ts` (mẫu truy vấn).

## File sẽ sửa / tạo

- `packages/shared/src/spam-rules.ts` (+test) — Zod, khớp, xem trước (hàm thuần); `index.ts` xuất.
- `packages/db/src/queries/spam-preview.ts` (+int test) — đọc bình luận 7 ngày; `runtime.ts` xuất.
- `apps/web/src/server/spam-rules.ts` (+test) — dịch vụ `preview`/`save` (store interface).
- `apps/web/src/lib/spam-rules-form.ts` (+test), `app/app/(guarded)/spam-rules/{page,actions}.tsx`, `components/spam-rules/spam-rule-builder.tsx`.
- `app-nav.ts` (+test), `vi.json`/`en.json`, docs (gap-matrix, MASTER, codemap dòng riêng, handoff, KIEM_TRA_TAY, CAN_BAN_CUNG_CAP, QUYET_DINH).

## Migration

Không có (làn d). Phần DB cho làn b: bảng `rules`/`rule_matches` theo docs/10 §3.5, RLS ghi bằng `withActor` (Owner); ghi vào gap matrix `SPAM-RULES-DB`.

## Test viết trước

`spam-rules.test.ts` (mọi nhánh khớp, ca biên, regex xấu), `spam-rules-form.test.ts`, `spam-rules.test.ts` (server).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/spam-rules.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib/spam-rules-form.test.ts src/server/spam-rules.test.ts`

## Cần kiểm chứng độc lập không?

Có — một lần `verifier-security` (quyền Owner, truy vấn theo workspace, regex người dùng nhập/ReDoS, che PII, không tự ẩn).

## Rủi ro / câu hỏi cho chủ dự án

Không chặn. Lưu quy tắc phụ thuộc làn b.

## Đề xuất thay đổi

Không sửa docs/01–16.

## Complexity tracking

Không có (interface `SpamRuleStore` có 2 nơi dùng: bản "chưa khả dụng" và bản giả trong test; bản DB do làn b).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc Q-SPR1).
