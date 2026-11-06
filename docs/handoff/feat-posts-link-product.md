# Handoff feat-posts-link-product (claude, làn b)

**Đã làm:** migration 0048 `cf.post_products` (RLS: AI/hệ thống chỉ `suggested`; `confirmed` do thành viên, `confirmed_by` = người ghi; UPDATE chỉ `is_primary`), schema, truy vấn (`linkProductsToPosts` hàng loạt, set primary, unlink, suggest, confirm, list, `productIdsForAnswering`), lõi thuần `@flow/shared/post-products` + test, test tích hợp, kỳ vọng `check-rls.ts`, docs (Q-PLP1, gap, MASTER, codemap, KT-PLP, docs/10).

**Đã đọc + rút ra:** mẫu `post-notes`/`product-aliases` (RLS Owner/thành viên, GRANT cột); drizzle không gói mảng JS thành 1 tham số → dùng literal `{a,b}` (`pgArray`); `check-rls` ACTOR_POLICIES chỉ có lệnh a/w/r.

**Chưa chạy được cục bộ:** `pnpm test:db`/`db:check-rls` (worktree không có `.env`/DB máy phụ; vitest int báo "No test files found") → dựa CI/máy phụ.

**Còn lại:** `POSTS-LINK-PRODUCT-UI` (nút gắn/hàng loạt/xác nhận trên `/app/posts`), `POSTS-LIST-LINK-FILTER` (lọc ở `listPosts`), worker sinh đề xuất AI, nối `productIdsForAnswering` vào pipeline.
