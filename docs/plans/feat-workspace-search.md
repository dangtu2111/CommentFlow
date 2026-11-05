# Kế hoạch `feat/workspace-search` — Ô tìm kiếm trong bộ chuyển workspace

## Việc

Mã gap matrix: `FR-005-SEARCH` · Spec: `docs/05` FR-005, `docs/08` §3 (thanh trên).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Thêm ô tìm kiếm vào danh sách workspace để người có nhiều workspace lọc nhanh theo tên (không phân biệt hoa/thường và dấu tiếng Việt). Phần "số việc cần xử lý" CHƯA làm vì spec chưa định nghĩa "cần xử lý" gồm trạng thái nào và đếm cho nhiều workspace mỗi lần dựng trang cần thiết kế riêng; ghi thành gap, không bịa số. Rủi ro thấp: chỉ giao diện phía trình duyệt, không đổi dữ liệu/quyền (chọn workspace vẫn do server kiểm thành viên).

## Điểm chưa rõ

Quyết định: chỉ làm tìm kiếm. Phần số cần xử lý giữ lại thành gap `FR-005-COUNT`: `[CẦN LÀM RÕ: "cần xử lý" = những trạng thái bình luận nào (gợi ý: Chờ duyệt + Cần người + Gửi lỗi)? đếm bằng một truy vấn gộp có RLS theo từng workspace — chấp nhận N truy vấn mỗi lần tải khung, hay cần hàm DB?]` (nằm ngoài nhánh này, không chặn việc tìm kiếm).

## Tiêu chí nghiệm thu

1. Gõ chữ vào ô tìm kiếm thì danh sách chỉ còn workspace có tên chứa chữ đó, bỏ qua hoa/thường và dấu ("cua hang" khớp "Cửa Hàng Đà Nẵng") — kiểm bằng: `pnpm --filter @flow/web exec vitest run src/lib/workspace-filter.test.ts`
2. Ô trống hoặc chỉ khoảng trắng → hiện đủ danh sách, giữ thứ tự gốc — kiểm bằng: test trên.
3. Không khớp → hiện dòng "Không tìm thấy workspace" (khóa i18n), mục "Tạo workspace mới" vẫn hiện — kiểm bằng: bước KT-009.
4. Chuyển workspace vẫn qua form + server action kiểm thành viên (không đổi) — kiểm bằng: bước KT-009 + typecheck.
5. Không có chuỗi chữ trực tiếp trong JSX — kiểm bằng: `pnpm lint:i18n`.

## File sẽ đọc (≤ ~8, kèm lý do)

`apps/web/src/components/app/workspace-switcher.tsx` (gốc), `apps/web/src/app/app/(guarded)/layout.tsx` (nơi dùng), `globals.css` đoạn `.ws-switch`, `messages/{vi,en}.json` mục `workspace.switcher`, `packages/saas-core/src/tenancy/slug.ts` (mẫu bỏ dấu).

## File sẽ sửa / tạo

- `apps/web/src/lib/workspace-filter.ts` (+ `.test.ts`): hàm thuần lọc theo tên.
- `apps/web/src/components/app/workspace-switcher-list.tsx`: component client có ô tìm kiếm + danh sách.
- `apps/web/src/components/app/workspace-switcher.tsx`: truyền chuỗi đã dịch xuống danh sách.
- `globals.css`, `vi.json`, `en.json`, codemap, gap-matrix, MASTER, `KIEM_TRA_TAY.md`.

## Migration

Không có.

## Test viết trước

`workspace-filter.test.ts` (FR-005): bỏ dấu/hoa thường, đ/Đ, rỗng, không khớp, giữ thứ tự.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/workspace-filter.test.ts`

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện, không chạm auth/RLS).

## Rủi ro / câu hỏi cho chủ dự án

Số cần xử lý hoãn (xem Điểm chưa rõ).

## Đề xuất thay đổi

Đề nghị docs/05 FR-005 định nghĩa "cần xử lý" (trạng thái nào).

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

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định nằm trong spec; phần mơ hồ đã tách khỏi nhánh).
