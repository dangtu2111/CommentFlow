# Bản đồ việc → mục spec

Khi giao việc cho Claude Code, chỉ trỏ đến các mục dưới đây. Không nạp cả `docs/`.

| Việc | Đọc |
|---|---|
| Nguyên tắc chung (luôn đúng) | `CLAUDE.md` · `01_Project_Overview.md` §6 |
| Log chi phí AI (`ai_usage`) | `10_Database_Design.md` §3.3 (`ai_usage`) · `05_Functional_Requirements.md` FR-034 · `06_Non_Functional_Requirements.md` §2 |
| Bộ đánh giá AI song ngữ | `14_Test_Plan.md` §4 · `06_Non_Functional_Requirements.md` §7 |
| LiteLLM + Langfuse (bước ①) | `09_System_Architecture.md` §2 · `12_Integration_Specification.md` §6–8 |
| Redis + worker pg-boss (bước ③) | `09_System_Architecture.md` §7.1, §9 |
| Dịch vụ `ml` (bước ④) | `09_System_Architecture.md` §4–5 · `11_API_Specification.md` §15 |
| Nhận ngôn ngữ vi/en | `09_System_Architecture.md` §5 |
| Pipeline AI | `09_System_Architecture.md` §4 · `05_Functional_Requirements.md` FR-C |
| Cổng tự gửi + hiệu chuẩn | `09_System_Architecture.md` §6 · `03_Product_Requirements.md` M05, M08 |
| Kiểm tra lại trước khi gửi | `09_System_Architecture.md` §6.1 · FR-110, FR-111 |
| Feature flag | `09_System_Architecture.md` §10 · `10_Database_Design.md` §3.8 |
| saas-core (auth, tenancy, billing…) | `09_System_Architecture.md` §3.1 · `10_Database_Design.md` §1, §3.1, §3.6 |
| RLS / cô lập dữ liệu | `10_Database_Design.md` §4 · `13_Security_Design.md` §4 · `14_Test_Plan.md` §3 |
| Gói cước, QR, hạn mức | `01_Project_Overview.md` §7 · `10_Database_Design.md` §3.6 · `11_API_Specification.md` §11 · `07_User_Flow.md` UF-9 |
| Webhook Meta, gửi trả lời, ẩn | `12_Integration_Specification.md` §1, §9 · `11_API_Specification.md` §5, §13 |
| Bảo vệ Meta App, rate limit | `09_System_Architecture.md` §11 |
| Trang Bình luận | `CommentFlow_UI_Design_Prompt.md` mục 7.1 · `05_Functional_Requirements.md` FR-D · `07_User_Flow.md` UF-3 |
| Cơ sở kiến thức + tìm kiếm | `05_Functional_Requirements.md` FR-E · `10_Database_Design.md` §3.4, §5 |
| Shopify + đối soát | `12_Integration_Specification.md` §4 · `09_System_Architecture.md` §7.2–7.3 |
| Bài viết gắn sản phẩm | FR-F · `07_User_Flow.md` UF-7 |
| Tự động hóa (trang) | `CommentFlow_UI_Design_Prompt.md` mục 7.3c · FR-G · UF-5 |
| Xóa dữ liệu Meta, quyền riêng tư | `11_API_Specification.md` §12–13 · `07_User_Flow.md` UF-10 · `13_Security_Design.md` §10 |
| Admin | `CommentFlow_Admin_Design_Prompt.md` · `11_API_Specification.md` §14 · `13_Security_Design.md` §3.2 |
| Giao diện, màu, component | `08_UI_UX_Specification.md` · logo `design/brand/` |
| Bố cục từng màn hình (Stitch) | `design/stitch/<trang>.png` (+ `.html` khi cần) — chỉ trang đang làm; danh sách ở `design/stitch/README.md` |
| Triển khai, CI | `15_Deployment_Architecture.md` |
| Quyết định đã chốt | `docs/decisions/000-chot-02-11.md` · `01_Project_Overview.md` §9a |
| i18n Việt/Anh (FR-119, 120) | `08_UI_UX_Specification.md` §8 · `05_Functional_Requirements.md` FR-L |
| Nguồn sản phẩm: Google Sheets, Haravan, Sapo, KiotViet, Pancake (FR-121, 122) | `12_Integration_Specification.md` §4 · `11_API_Specification.md` §8 (`/integrations/:provider`) |
| Tìm sản phẩm, bí danh, biến thể, bảng size (FR-127–129, 149) | `10_Database_Design.md` §3.4, §5.1–5.2 · `11_API_Specification.md` §7 |
| Đoạn có ngữ cảnh, hạn hiệu lực, halfvec, cache theo giá (FR-130, 131, 135, 139) | `10_Database_Design.md` §3.4, §5, §5.3 |
| Bước `extract`, định tuyến, viết lại câu hỏi (FR-136, 137, 162) | `09_System_Architecture.md` §4 · `05_Functional_Requirements.md` FR-O, FR-R |
| Thang xử lý khi không chắc `decideAction` (FR-141, 147–160) | `09_System_Architecture.md` §4, §6 · `07_User_Flow.md` UF-2b · `05_Functional_Requirements.md` FR-P, FR-Q |
| Độ tin cậy do code tính (FR-163) | `09_System_Architecture.md` §6.0 |
| Trích nguồn, đa dạng câu, prompt caching (FR-138, 140, 161) | `09_System_Architecture.md` §4 · `10_Database_Design.md` §5.3 |
| Câu mẫu, kb_gaps, độ sẵn sàng (FR-132, 134, 146) | `10_Database_Design.md` §3.3–3.4, §5.4 · `07_User_Flow.md` UF-11 · `11_API_Specification.md` §8 |
| Gộp bình luận liên tiếp (FR-148) | `09_System_Architecture.md` §7.1a |
| Chống cài lệnh qua nguồn (FR-164) | `13_Security_Design.md` §1 · `05_Functional_Requirements.md` FR-R |
| Bộ đánh giá ~300 mẫu (FR-165) | `14_Test_Plan.md` §4 |
| Hai máy, staging, việc cơ học | `AGENTS.md` § Hai máy · `docs/decisions/002-hai-may.md` · `docs/workflows/staging-verify.md` · `15_Deployment_Architecture.md` §1 |
