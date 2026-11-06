# Bàn giao `feat-data-priority` (claude, làn C)

## Đã làm

- `packages/ai/src/retrieve/data-priority.ts`: `SOURCE_PRIORITY`, `postNotesToSources`, `orderByPriority` (+ test, có property-based fast-check).
- `retrieve.ts`: nhận `postNotes`, `now`; xếp nguồn ghi chú → sản phẩm → kiến thức; ghi chú nghi cài lệnh gộp vào `quarantined`.
- Quyết định QDP1, codemap, gap matrix, MASTER.

## Đã đọc và rút ra

- `retrieve/sources.ts`, `retrieve.ts`: route `sql` không tìm kb; test cần route `both` (có `asks`) để thấy đủ 3 loại nguồn.
- `DraftSource.kind` đã có `post_note`/`policy`; chưa có nguồn nào sinh `policy` (kb chưa phân loại FAQ/chính sách/thông tin shop).

## Còn lại

- Nối truy vấn `listActivePostNotes` (withWorkspace) vào bước gọi `retrieveKnowledge` khi pipeline được nối.
- Quy tắc prompt "nguồn đứng trước thắng khi mâu thuẫn" (đổi `draft@N`, kiểm bằng AI-EVAL).
- Phân loại đoạn kiến thức thành `policy` vs `kb` chung (cần cột loại đoạn — làn b).
