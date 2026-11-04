# Kế hoạch `feat/inbox-list` — trang Bình luận: tab trạng thái, danh sách, lọc, tìm, sắp xếp

## Việc

Mã MASTER: `INBOX-LIST` · FR-040 (tab trạng thái, lọc, tìm kiếm, sắp xếp) · Spec: `docs/08` §3–§4 (khung ứng dụng, trang Bình luận 3 cột), `docs/07` UF-3 (cũ nhất trước), `docs/10` §3.2 (`comments`, trạng thái bình luận), thiết kế `design/stitch/comments.png` + `comments.html` (mục 7.1 của `CommentFlow_UI_Design_Prompt.md`).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Thêm trang **Bình luận** (`/app/comments`): cột trái là các tab trạng thái kèm số lượng thật, giữa là danh sách bình luận (tác giả, kênh, thời gian, nội dung, trạng thái) có tìm kiếm, lọc theo nền tảng/kênh/bài quảng cáo và sắp xếp, cột phải tạm là khung "Chọn một bình luận" (phần chi tiết/trả lời là việc sau). Chỉ hiển thị dữ liệu thật trong DB — không có số liệu/huy hiệu bịa; tính năng chưa có dữ liệu (nhãn AI, "Giao cho tôi", gợi ý AI) chưa hiện. Rủi ro thấp: chỉ đọc, mọi truy vấn đi qua `withActor` + RLS; điểm cần chú ý là chống rò dữ liệu giữa workspace và tìm kiếm an toàn (thoát ký tự `%`/`_`).

## Điểm chưa rõ

Không có (các quyết định dưới đây theo spec/thiết kế; mục lệch/thiếu ghi vào gap, không bịa):
1. **Tab:** theo thiết kế Stitch — Chờ duyệt · Sẽ tự gửi · AI đã tự gửi · Cần nhân viên · Nghi spam · Gửi lỗi · Đã trả lời · Đã ẩn · Bỏ qua · Tất cả; thêm theo `docs/08` §4 tab **Cần hỗ trợ thêm** (`needs_followup`) và — **bổ sung ngoài thiết kế** — tab **Mới** (trạng thái `new`/`processing`) vì hiện mọi bình luận từ webhook ở trạng thái `new` (nếu không sẽ không thấy ở tab nào ngoài "Tất cả"); ghi vào `design/stitch/README.md`. `sending` gộp vào "Sẽ tự gửi". Bình luận đã gộp (`merged_into_id` khác NULL) không hiện trong danh sách.
2. **Số lượng:** thật, đếm trong DB (không bịa); không có "SLA còn lại", "Ca sáng", "độ chính xác AI", "Có AI"…
3. **Lọc:** nền tảng (Facebook/Instagram/TikTok), kênh cụ thể, "chỉ bài quảng cáo" (`posts.is_ad`). **Chưa làm** (ghi gap): lọc theo nhãn AI (`INBOX-LABEL-FILTER` — chưa có phân loại), "Giao cho tôi" (`INBOX-ASSIGN` — chưa có trường giao việc), ưu tiên Mua hàng/Khiếu nại lên đầu (cần nhãn), "N bình luận mới — bấm để tải" (realtime), bối cảnh bài + sản phẩm, chi tiết/trả lời/khóa mềm/hành động hàng loạt (`INBOX-DETAIL` … các mục MASTER riêng).
4. **Tìm kiếm:** theo tên tác giả hoặc nội dung, **không phân biệt hoa/thường và dấu tiếng Việt** (`unaccent`), thoát `%`/`_`/`\`; chưa có chỉ mục trigram (gap `INBOX-SEARCH-INDEX`, thêm khi đo chậm). Tìm kiếm toàn cục ở thanh trên + số việc cần xử lý của bộ chuyển workspace là `FR-005-SEARCH` (việc riêng).
5. **Sắp xếp:** cũ nhất trước (mặc định, theo UF-3) hoặc mới nhất trước; phân trang **con trỏ** (khóa `(created_time, id)`), 25 dòng/trang, nút "Xem trang kế tiếp".
6. **Khung:** giữ header hiện có, thêm liên kết "Bình luận" (mọi vai trò) vào thanh nav; **chưa dựng sidebar đầy đủ** (các trang khác chưa có) — gap `APP-SHELL`.
7. **Quyền:** mọi thành viên đang hoạt động (Owner/Staff) xem được; Staff không bị giới hạn kênh ở GĐ này (hạn chế theo kênh nếu spec có sẽ làm riêng).
8. **Mobile 390px:** cột xếp dọc, tab thành hàng chip cuộn ngang, danh sách chiếm toàn chiều rộng.

## Tiêu chí nghiệm thu

1. Hàm `listComments(tx, filter)` (`packages/db/src/queries/inbox.ts`, chỉ đọc): lọc theo tab (định nghĩa ở điểm 1), nền tảng, kênh, bài quảng cáo, tìm kiếm; sắp xếp 2 chiều; phân trang con trỏ ổn định (không lặp/sót khi cùng `created_time`); loại bình luận đã gộp — test tích hợp DB với dữ liệu gieo.
2. `countCommentsByTab(tx, filter)` trả số thật cho mọi tab trong MỘT truy vấn, áp cùng bộ lọc nền tảng/kênh/quảng cáo/tìm kiếm (số tab khớp danh sách khi chọn tab đó) — test tích hợp.
3. **Cô lập workspace:** gọi bằng `withActor(A, userA)` không bao giờ trả bình luận/kênh của workspace B (kể cả khi lọc `channelId` của B, cursor giả, tìm kiếm); người không phải thành viên → 0 dòng — test tích hợp.
4. Tìm kiếm: "gia" khớp "giá"; không phân biệt hoa/thường; `%`, `_`, `\`, `'` được hiểu là ký tự thường (không khớp tràn, không lỗi SQL, không chèn SQL) — test tích hợp + đơn vị.
5. `parseInboxSearchParams(searchParams)` (`apps/web/src/lib/inbox-filters.ts`, thuần): Zod; giá trị lạ/thiếu → mặc định an toàn (tab Chờ duyệt, cũ nhất trước), `q` cắt ≤ 100 ký tự, `cursor` hỏng → bỏ qua; dựng lại URL giữ nguyên bộ lọc (`buildInboxHref`) — test đơn vị (bảng + property không ném lỗi với đầu vào bậy).
   *Mặc định:* tab **Chờ duyệt** khi vào trang (UF-3), sắp xếp cũ nhất trước.
6. Trang `/app/comments` (Server Component): gọi `requireAppUser` (test quét `requireAppUser` hiện có phải thấy trang), dùng `withActor`, hiển thị tab + số lượng, danh sách, tìm kiếm/lọc bằng GET form (không cần JS), trạng thái rỗng ("Chưa có bình luận") và lỗi dịch vụ; khung chi tiết "Chọn một bình luận"; vi + en đủ khóa (`lint:i18n` xanh), mọi chuỗi qua next-intl; màu/chữ từ token — kiểm bằng test đơn vị thành phần/hàm định dạng + dựng thử `next build`.
7. Nội dung bình luận hiển thị dạng văn bản thuần (React thoát HTML; không `dangerouslySetInnerHTML`), cắt ngắn 3 dòng; tên tác giả rỗng → "Khách ẩn danh"; thời gian tương đối theo ngôn ngữ giao diện (`Intl.RelativeTimeFormat`) với `title` là thời điểm đầy đủ — test đơn vị hàm định dạng.
8. Truy cập: tab là liên kết (`aria-current`), form có nhãn, danh sách `<ul>`; điều hướng bàn phím được — kiểm tay (KT-003) + eslint a11y nếu có.
9. Công cụ xanh (đọc mã thoát từng lệnh): lint, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test, test:trace (FR-040 có test), test:coverage, test:db, `next build`, `db:check-rls`.

## File sẽ đọc (đã đọc khi lập kế hoạch) / file sẽ sửa

Đọc: `docs/08` §3–4, `docs/07` UF-3, `docs/10` §3.2, `design/stitch/comments.png`, `apps/web/src/app/app/(guarded)/{layout,page}.tsx`, `apps/web/src/server/{require-app-user,webhook-runtime}.ts`, `apps/web/src/i18n/messages.ts`, `packages/db/src/{client,runtime}.ts`, schema `cf/{comments,channels,posts}.ts`, `packages/db/tests/helpers.ts`.

Tạo/sửa:
- `packages/db/src/queries/inbox.ts` (+ `runtime.ts` xuất) và `packages/db/tests/inbox.int.test.ts`: truy vấn thuần Drizzle/`sql`, chỉ đọc.
- `apps/web/src/lib/inbox-filters.ts` (+ test): phân tích/dựng URL; `apps/web/src/lib/inbox-format.ts` (+ test): thời gian tương đối, rút gọn.
- `apps/web/src/server/db.ts`: một `FlowDb` dùng chung cho web (`DATABASE_URL`, role `cf_app`); `webhook-runtime.ts` dùng lại.
- `apps/web/src/app/app/(guarded)/comments/page.tsx`; `apps/web/src/components/comments/{inbox-tabs,inbox-toolbar,inbox-list,inbox-empty,comment-detail-placeholder}.tsx`.
- `apps/web/src/app/app/(guarded)/layout.tsx`: thêm liên kết "Bình luận".
- `packages/shared/src/i18n/messages/{vi,en}.json` (khóa `comments.*`, `workspace.header.comments`); `apps/web/src/styles/globals.css` (+ token sẵn có).
- `design/stitch/README.md` (ghi tab "Mới" ngoài thiết kế), `docs/testing/KIEM_TRA_TAY.md` (KT-003), `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`.

## Migration

Không có (đủ chỉ mục hiện tại: `comments_workspace_status_created_idx (workspace_id, status, created_time)`, `comments_channel_external_unique`). Chỉ mục trigram cho tìm kiếm: gap `INBOX-SEARCH-INDEX`, thêm khi cần.

## Test viết trước

Tiêu chí 1–5, 7 (truy vấn + phân tích tham số + định dạng) viết test trước. Lệnh phạm vi hẹp:
```
pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/inbox.int.test.ts
pnpm --filter @flow/web exec vitest run src/lib
pnpm --filter @flow/web build
```

## Cần kiểm chứng độc lập không?

Không: chỉ đọc, đi qua `withActor` + RLS đã được kiểm chứng; có test cô lập workspace và test tìm kiếm an toàn. Nếu phát hiện cần đổi policy/hàm DB thì dừng và kiểm chứng.

## Rủi ro / câu hỏi cho chủ dự án

- Thiết kế Stitch có nhiều thông tin chưa có dữ liệu thật (SLA, ca làm việc, độ chính xác AI, huy hiệu "Có AI", ADS...). Tôi **không dựng** những phần này (đúng ràng buộc "không bịa số/huy hiệu"); chỉ dựng cái dữ liệu đã có. Tab "Mới" thêm ngoài thiết kế (ghi README).
- Tìm kiếm dùng `unaccent` + `ILIKE` (quét theo workspace, tốt đến vài chục nghìn bình luận); chỉ mục trigram làm khi đo chậm.
- **Kiểm tra tay** (KT-003 ≤ 10 bước, vi + en): cần vài bình luận mẫu — dùng `pnpm webhook:send` (KT-002) sau khi có kênh; ghi vào `docs/testing/KIEM_TRA_TAY.md`.

## Đề xuất thay đổi

Không (không đụng `docs/01–16`).

## Complexity tracking

Không đi ngược nguyên tắc nào. Lớp truy vấn đặt ở `packages/db/src/queries` (dữ liệu của sản phẩm; saas-core không import) — nếu sau này nhiều truy vấn sản phẩm, cân nhắc gói riêng (đề xuất trong `docs/decisions/`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (không cần verifier — chỉ đọc)
- [x] Không thư viện mới
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Không bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt theo `docs/PROMPT_BUILD_TOAN_BO.md` §2: quyết định theo spec/thiết kế, mục thiếu dữ liệu ghi gap, không bịa; chủ dự án đã giao thứ tự `WH-INGEST → INBOX-LIST`).
