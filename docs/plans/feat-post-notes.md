# Kế hoạch `feat-post-notes` — Ghi chú theo bài có hạn + ghi đè chế độ tự động theo bài

Mã gap matrix: `POST-NOTES` · Spec: FR-062, US-033, `docs/10_Database_Design.md` (`post_notes`).

**Tóm tắt (2–3 câu):** Owner ghi chú riêng cho từng bài (ví dụ "giá livestream 199k tới 22h") có ngày bắt đầu/kết thúc; hết hạn thì tự không còn được dùng khi trả lời. Owner cũng có thể hạ chế độ tự động của riêng một bài (tắt, hoặc chỉ chạy bóng). Rủi ro chính là làm lộ quyền ghi cho Staff hoặc cho phép "nới" tự gửi — nên ghi chỉ Owner/hệ thống, và ghi đè **không bao giờ** bật `auto` (CHECK ở DB + hàm thuần).

## Điểm chưa rõ

Không có (tự chọn phương án an toàn, ghi ở Q-PN1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Ghi chú: nội dung 1–1000 ký tự (NFC, gộp khoảng trắng), hạn phải sau ngày bắt đầu — kiểm bằng `packages/shared/src/post-notes.test.ts`.
2. Hết hạn thì không dùng: biên bắt đầu tính (`>=`), kết thúc loại (`<`); SQL `listActivePostNotes` khớp `postNoteStatus` — kiểm bằng unit test + `post-notes.int.test.ts`.
3. Ghi đè chỉ siết: `effectiveAutoMode` = min(nền, ghi đè); DB CHECK từ chối `auto` — unit test + int test.
4. RLS: chỉ Owner/hệ thống ghi, Staff đọc, workspace khác không thấy/ghi (FK 23503), withWorkspace trần chỉ đọc — `post-notes.int.test.ts` + `pnpm db:check-rls` (kỳ vọng thêm vào `check-rls.ts`).
5. Xóa bài → xóa ghi chú + ghi đè (cascade) — int test.
6. Coverage `packages/shared` giữ ngưỡng — `pnpm --filter @flow/shared test:coverage`.

## File sẽ đọc

`docs/gap-matrix.md`, `docs/codemap.md` (dòng liên quan), `packages/db/src/schema/cf/{posts,size-charts}.ts`, `queries/size-charts.ts`, `migrations/0044_size_charts.sql`, `tests/size-charts.int.test.ts`, `src/check-rls.ts` (mẫu).

## File sẽ sửa / tạo

- `packages/shared/src/post-notes.ts` (+test) — kiểm đầu vào, trạng thái theo thời gian, `effectiveAutoMode`; `index.ts` xuất.
- `packages/db/src/schema/cf/post-notes.ts`, `migrations/0045_post_notes.sql` (+meta) — hai bảng + RLS.
- `packages/db/src/queries/post-notes.ts` — CRUD ghi chú, liệt kê đang hiệu lực, đặt/bỏ/đọc ghi đè.
- `packages/db/src/check-rls.ts`, `tests/post-notes.int.test.ts`.
- docs: `10_Database_Design.md`, `QUYET_DINH_CHO_DUYET.md`, `gap-matrix.md`, `MASTER.md`, `codemap.md`, `KIEM_TRA_TAY.md`, handoff.

## Migration

`0045_post_notes.sql`: `cf.post_notes`, `cf.post_auto_overrides` (+ RLS, GRANT theo cột). Đường lùi: `DROP TABLE` hai bảng + bỏ kỳ vọng `check-rls.ts`. Chưa có nơi dùng trong pipeline nên không cần phối hợp worker.

## Test viết trước

`post-notes.test.ts` (đỏ vì chưa có module, rồi xanh) cho kiểm đầu vào, biên thời gian, `effectiveAutoMode`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared test` · `pnpm --filter @flow/shared test:coverage` · `pnpm test:db` (cần `.env`, máy phụ) · `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` một lần (migration + RLS). Không chạm auth/token/webhook/cổng tự gửi (ghi đè chưa nối vào `decideAction`/cổng).

## Rủi ro / câu hỏi cho chủ dự án

Không cần hỏi. Nối ghi chú vào truy xuất (ưu tiên dữ liệu) thuộc `DATA-PRIORITY`; API/UI nằm trong gap matrix. Ghi chú chứa giá thì vẫn phải qua guard số tiền (nguyên tắc 4) khi dùng.

## Đề xuất thay đổi

Không (chỉ ghi chú thực tế vào `docs/10`).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới": cả hai bảng ghi theo vai trò Owner (`withActor`) hoặc hệ thống (`withJob`)

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-PN1).
