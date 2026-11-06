# So sánh số đo — Cơ sở kiến thức + Bài viết (feat-ui-html-kb-posts)

Công cụ: `node e2e/tools/ui-compare-kb-posts.mjs http://localhost:3103` (Playwright, 1440px; Stitch mở bằng `file://`, bản dựng ở `/dev/ui/kb` và `/dev/ui/kb-posts`, dữ liệu [MẪU]).

| Màn | Phần tử | Stitch (w×h) | Bản dựng (w×h) | Bo góc (S / D) | Cỡ chữ (S / D) | Đệm trái (S / D) |
|---|---|---|---|---|---|---|
| Cơ sở kiến thức | Cột rail | 224×1325 | 224×374 | 0 / 0 | 16 / 16 | 0 / 0 |
| Cơ sở kiến thức | Mục rail (hiện tại) | 224×40 | 224×40 | 8 / 8 | 13 / 13 | 12 / 12 |
| Cơ sở kiến thức | Mục rail (thường) | 224×40 | 224×40 | 8 / 8 | 13 / 13 | 12 / 12 |
| Cơ sở kiến thức | Thanh độ đầy đủ | (bộ chọn trúng thanh con) | 192×8 | full / full | — | — |
| Cơ sở kiến thức | Thanh lệnh | 1184×168 | 848×121 | 0 / 12 | 16 / 16 | 24 / 24 |
| Bài viết | Thẻ bài | 665×206 | 452×174 | 12 / 12 | 16 / 16 | 12 / 24 |
| Bài viết | Nhãn nền tảng | 138×20 | 213×24 | full / full | 11 / 12 | 8 / 8 |

**Khớp:** rộng/cao/bo/chữ/đệm của rail; bo thẻ bài; thanh độ đầy đủ 8px.
**Lệch có chủ ý:** chiều rộng thanh lệnh/thẻ bài do khung ứng dụng (thanh bên + `app-page-wide`) quyết định, không thuộc phạm vi làn; thiết kế Stitch có cột phải "Cấu hình bài" (chỉ ở `/dev/ui/kb-posts` [MẪU]) và ảnh bài (chưa có dữ liệu ảnh) nên thẻ bài thấp hơn/hẹp hơn; chip kit cao 24px/chữ 12px (Stitch 20px/11px) — chip là thành phần dùng chung toàn app, không đổi ở làn này; đệm trái thẻ bài 24px thay 12px vì dành chỗ cho vạch nhấn 6px.
**Số dòng CSS (trước → sau):** `kb-posts.css` 339 + khối posts trong `globals.css` 76 → `kb.css` ~125 + `posts.css` ~215 + `rail-nav.css` ~95 (rail dùng lại cho mọi tab KB; phần posts gồm cả CSS dev [MẪU]). `globals.css` giảm 76 dòng.
