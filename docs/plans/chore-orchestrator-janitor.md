# Kế hoạch `chore/orchestrator-janitor` — Janitor, nhịp tim, khóa merge cho bộ điều phối

## Việc

Mã gap matrix: không có (cải tiến quy trình) · Spec: `docs/workflows/orchestrator.md`, ADR 012.

**Tóm tắt:** PR #108/#111/#117 kẹt lâu vì không ai theo dõi sau khi driver chết hoặc CI chạy chậm. Thêm vào `tools/orchestrator`: lệnh `janitor` quét PR mở > 30 phút không có driver rồi đưa vào land; nhịp tim mỗi 5 phút và cảnh báo làn im > 15 phút; cờ khóa merge (`.orchestrator/merge-freeze`); kiểm lại CI ngay trước khi merge. Không đổi logic sản phẩm. Rủi ro thấp: công cụ vẫn không push/rebase/force.

## Điểm chưa rõ

Không có. (Quyết định tự chọn ghi ở `docs/plans/quyet-dinh/qoj1.md`.)

## Tiêu chí nghiệm thu

1. `selectOrphanPrs` chỉ chọn PR mở > 30 phút, không nháp, không dấu theo dõi còn hạn, chưa KẸT ở cùng commit — kiểm bằng: test `janitor.test.mjs`.
2. `findSilentLanes`/`startHeartbeat`: làn đang chạy im > 15 phút bị báo `IM LẶNG` một lần; nhịp 5 phút — kiểm bằng: test.
3. Khóa merge chặn merge (driver + janitor) nhưng không chặn sửa — kiểm bằng: test `decidePr`, `runJanitorOnce`.
4. Không merge khi CI đỏ/đang chạy: kiểm lại ngay trước merge; còn pending không đếm đỏ — kiểm bằng: test.
5. `docs/workflows/orchestrator.md` mục "Bài học" có phân tích nguyên nhân; `pnpm lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `codemap:check`, `quyet:check` xanh.

## File sẽ đọc

`tools/orchestrator/src/{runner,decide,config,checks,adapters,logger}.mjs`, `bin/orchestrator.mjs`, `tests/runner.test.mjs`, `docs/workflows/orchestrator.md`.

## File sẽ sửa / tạo

`tools/orchestrator/src/{heartbeat,janitor,markers}.mjs` (mới), `src/{decide,runner,config,adapters,logger}.mjs`, `bin/orchestrator.mjs`, `orchestrator.config.example.json`, `tests/janitor.test.mjs`, `docs/workflows/orchestrator.md`, `docs/codemap.d/`, `docs/plans/quyet-dinh/qoj1.md`, handoff.

## Migration

Không có.

## Test viết trước

`tests/janitor.test.mjs` viết trước mã (đỏ → xanh).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/orchestrator test`

## Cần kiểm chứng độc lập không?

Không (công cụ quy trình, không chạm auth/RLS/thanh toán).

## Rủi ro / câu hỏi cho chủ dự án

Janitor dùng một làn làm worktree gỡ kẹt (`janitor.lane` trong config). Chủ dự án cần chọn làn rảnh khi bật.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong ADR 012 / yêu cầu chủ dự án 06/11/2026).
