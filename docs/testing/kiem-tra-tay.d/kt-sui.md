## KT-SUI — Gợi ý AI + đổi nhãn (SUGGEST-UI, FR-043, US-011/012/014) · AI suggestion + relabel

Ô gợi ý chưa có dữ liệu thật (chờ bảng `drafts`); phần đổi nhãn kiểm được trên staging. / Suggestion box has no real data yet (awaits `drafts`); relabel is checkable on staging.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `pnpm --filter @flow/shared test` và `pnpm --filter @flow/web exec vitest run src/lib/suggestion.test.ts`. | Xanh: gửi nguyên văn → `sent_as_is`; sửa → `edited` + khoảng cách; chip nguồn ≤ 5 (+N); ô gợi ý ẩn khi không có gợi ý. |
| 2 | Mở một bình luận → ô "Đổi nhãn" → chọn nhãn khác → "Lưu nhãn". | Trang làm tươi, chip nhãn đổi; bình luận đã xóa không có ô đổi nhãn; đổi sang en vẫn đủ chữ. |
