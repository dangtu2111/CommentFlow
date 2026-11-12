# Màn xác thực thiếu thiết kế Stitch (làn a, feat-ui-auth)

- forgot-password (Quên mật khẩu)
- reset-password (Đặt lại mật khẩu)
- check-email (Kiểm tra email)
- verify-email (Xác minh email: thành công/lỗi)
- login/2fa (Xác thực 2 bước khi đăng nhập)
- invite-invalid (Lời mời không dùng được)

# Màn thiếu thiết kế Stitch (làn d, feat-ui-knowledge-posts)

- Nhập Excel sản phẩm (`/app/products/import`, trình hướng dẫn nhập) — chưa có màn thiết kế riêng; hiện chỉ bọc khung Cơ sở kiến thức
- Cơ sở kiến thức: Nguồn dữ liệu / Thông tin cửa hàng / Chính sách / Tài liệu / Giọng văn / Từ điển viết tắt — có trong menu thiết kế nhưng chưa có tính năng; cần thiết kế từng màn khi làm

# Màn thiếu thiết kế Stitch (làn a, feat-ui-settings-pages)

- Cài đặt › Dữ liệu & Quyền riêng tư (trang trong ứng dụng, Owner): xuất dữ liệu, thời gian lưu, xóa workspace nhiều bước — `privacy-data-deletion.png` là trang công khai tra cứu xóa dữ liệu Meta, không phải trang này; hiện dựng bằng component sẵn có
- Cài đặt › Thông báo: chưa có thiết kế; hiện là danh sách loại sự kiện + "Sắp có"

# Màn thiếu thiết kế Stitch (feat-kb-wire-content, 07/11/2026)

- Cơ sở kiến thức › Thông tin cửa hàng (`/app/kb/shop`): biểu mẫu theo ngôn ngữ — hiện dựng theo ngôn ngữ hình ảnh Stitch, chưa có màn riêng
- Cơ sở kiến thức › Chính sách (`/app/kb/policies`): danh sách + thêm/sửa/xóa theo loại — chưa có màn riêng
- Cơ sở kiến thức › Hỏi – đáp FAQ (`/app/kb/faq`): danh sách cặp hỏi–đáp + thẻ + ngôn ngữ — chưa có màn riêng
- Cơ sở kiến thức › Giọng văn thương hiệu (`/app/kb/voice`): xưng hô, nên/không nên, câu mời chuyển người — chưa có màn riêng

# Màn thiếu thiết kế Stitch (DRAFT-FACT-SLOTS, 08/11/2026 — chủ dự án sẽ tạo bằng Stitch)

- **Cơ sở kiến thức › Chính sách có cấu trúc** (thay/bổ sung mục "Chính sách" dạng văn bản ở `knowledge-base.png` §7.3; ADR `docs/decisions/017-draft-fact-slots.md`, kế hoạch `docs/plans/feat-draft-fact-slots.md`). Cần các phần:
  - Bốn thẻ có cấu trúc: **Ship** (bảng khu vực: tên hiển thị, từ khớp địa điểm, phí, thời gian, COD có/không; dòng "Toàn quốc"), **Đổi trả** (số ngày, điều kiện, ai chịu phí), **Bảo hành** (thời hạn, phạm vi), **Thanh toán** (phương thức: COD, chuyển khoản, trả góp, hóa đơn).
  - Mỗi giá trị hiển thị nguồn (nhập tay / đề xuất từ Shopify / đề xuất từ văn bản) và trạng thái **Nháp / Đã duyệt**; chỉ Owner được duyệt.
  - Banner "AI đề xuất điền thẻ từ chính sách văn bản/Shopify — N giá trị chờ duyệt" kèm so sánh giá trị đề xuất với đoạn nguyên văn được trích; nút Duyệt / Sửa / Bỏ.
  - Chỉ báo "Độ phủ sự kiện": thẻ nào còn trống (AI sẽ mời ib thay vì trả lời) và gợi ý điền.
  - Tùy chọn Owner "Nêu số lượng tồn" / "Báo sắp hết khi ≤ N" (STOCK-DISCLOSURE-OPTION) đặt ở Quy tắc & Giới hạn, hiển thị ví dụ câu.
  - Cần cả bản 1440px và 390px.

# Màn thiếu thiết kế Stitch (feat/kb-policies-edit, 09/11/2026)

- **Chính sách có cấu trúc › Hộp thoại "Sửa giá trị" / "Thêm giá trị"** (4 loại: khu vực ship, đổi trả, bảo hành, thanh toán): bản Stitch `kb-policies-structured` có nút "Sửa tay" nhưng chưa vẽ biểu mẫu. Hiện dựng bằng thành phần Cơ sở kiến thức sẵn có (`policy-value-form.tsx`, trang `/app/kb/policies/edit`); cần thiết kế riêng cả desktop 1440px và mobile 390px (các ô theo từng loại, lỗi nhập, ghi chú "lưu thành nháp, bấm Duyệt để áp dụng").
- Cơ sở kiến thức – Câu hỏi chưa trả lời (`/app/kb-gaps`, kể cả tab "Chờ duyệt") và Nhập sản phẩm Excel/CSV (`/app/products/import`): chưa có màn Stitch riêng (kb-catalog là danh mục sản phẩm, không phải trang nhập) — đã dựng bằng ngôn ngữ thiết kế KB (class Tailwind của kb-faq/kb-shop), cần người điều phối vẽ màn riêng để so lại.
