# Kế hoạch `feat/fr-005-count` — Số bình luận cần xử lý trong bộ chuyển workspace

Mã gap matrix: `FR-005-COUNT` · Spec: `docs/05_Functional_Requirements.md` FR-005 (US-006).

**Tóm tắt (2–3 câu):** bộ chuyển workspace hiện chỉ có tên; ta thêm một con số nhỏ bên cạnh mỗi workspace cho biết còn bao nhiêu bình luận cần người xử lý (Mới, Chờ duyệt, Cần người, Gửi lỗi; chưa xóa, chưa gộp). Mỗi workspace được đếm bằng một truy vấn riêng chạy qua `withActor` (cách truy cập có kiểm quyền thành viên), nên người dùng không bao giờ thấy số của workspace mình không thuộc về. Rủi ro: tải thêm N truy vấn nhỏ mỗi lần dựng khung — một nơi lỗi thì chỉ mất nhãn nơi đó.

## Điểm chưa rõ

Không có (định nghĩa đã chốt ở Q4 trong `QUYET_DINH_CHO_DUYET.md`, khớp docs/05).

## Tiêu chí nghiệm thu

1. Đếm đúng 5 trạng thái `new`, `processing`, `pending_review`, `needs_human`, `send_failed`; bỏ `deleted_at`, `merged_into_id`, các trạng thái khác — kiểm bằng: `packages/db/tests/actionable-count.int.test.ts` (`pnpm test:db`).
2. Người không phải thành viên / sai ngữ cảnh workspace → 0 (RLS) — kiểm bằng: cùng file test.
3. `collectActionableCounts`: một workspace lỗi → `null`, không hỏng cả danh sách; `formatActionableCount`: 0/null ẩn, ≥100 → "99+" — kiểm bằng: `apps/web/src/lib/workspace-count.test.ts`.
4. Bộ chuyển hiện nhãn số (kèm `aria-label` dịch vi/en) cạnh workspace có việc — kiểm bằng: `pnpm lint:i18n`, `pnpm typecheck`, kiểm tay.
5. `pnpm lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `test:trace` xanh.

## File sẽ đọc

`docs/05` FR-005, `workspace-switcher{,-list}.tsx`, `(guarded)/layout.tsx`, `packages/db/src/queries/inbox.ts` + `runtime.ts`, `server/inbox.ts` (mẫu `withActor`), `inbox.int.test.ts` (mẫu test), `messages/{vi,en}.json`.

## File sẽ sửa / tạo

Sửa: `queries/inbox.ts`, `runtime.ts`, `workspace-switcher{,-list}.tsx`, `(guarded)/layout.tsx`, `globals.css`, `vi.json`, `en.json`, docs/05, gap-matrix, codemap, QUYET_DINH. Tạo: `server/workspace-counts.ts`, `lib/workspace-count{,.test}.ts`, `tests/actionable-count.int.test.ts`, handoff, plan này.

## Migration

Không có.

## Test viết trước

Hai file test ở tiêu chí 1–3 viết trước mã (đỏ vì thiếu hàm/export).

## Lệnh test phạm vi hẹp

`cd packages/db && pnpm exec vitest run --config vitest.int.config.ts tests/actionable-count.int.test.ts` · `cd apps/web && pnpm exec vitest run src/lib/workspace-count.test.ts`

## Cần kiểm chứng độc lập không?

Không: chỉ đọc, đi qua `withActor` sẵn có, không thêm bảng/policy; test chéo workspace có. (Chạm RLS ở mức dùng, không sửa.)

## Rủi ro / câu hỏi cho chủ dự án

N truy vấn mỗi lần dựng khung (song song; N nhỏ). Nếu một người có hàng chục workspace cần hàm DB gộp — làm sau, cần migration.

## Đề xuất thay đổi

Không (docs/05 đã sửa theo Q4, ghi trong QUYET_DINH).

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

**Đã duyệt** (AGENTS.md § Quy tắc hỏi: tự chọn phương án khuyến nghị, ghi ở QUYET_DINH Q4).
