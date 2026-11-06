# Bàn giao `feat-posts-list` (claude)

**Đã làm:** `POSTS-LIST` phần không cần migration: truy vấn `listPosts` (`packages/db/src/queries/posts.ts`), `posts-filters.ts` (tham số URL), `server/posts.ts`, trang `/app/posts`, component `components/posts/*`, mục menu "Bài viết", i18n vi+en, CSS.
**Đã đọc, rút ra:** `posts` có sẵn `message/permalink/media_url/is_ad/comment_count/pending_count`; `post_products` CHƯA có (không migration nào); mẫu `inbox.ts`/`comments/page.tsx` dùng lại (thanh lọc `.inbox-toolbar`).
**Chưa chạy được:** `posts.int.test.ts` (cần DB `cf_test` + lệnh có `CF_LANE`; phiên không có quyền) → CI/máy phụ chạy `CF_LANE=a pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/posts.int.test.ts`.
**Còn lại:** `POSTS-LIST-LINK-FILTER` (cần `post_products`, làn b), ảnh bài/lưới, "Đồng bộ bài mới", tab đếm theo nền tảng. Quyết định: Q-PL1.
