## KT-RLS — Ngôn ngữ trả lời của AI theo kênh (REPLY-LANG-SETTING, FR-120, feat-reply-lang-ui)

Điều kiện: có ít nhất một kênh đã kết nối (KT-014); một tài khoản Owner và một Staff.
1. Owner mở `/app/settings`. — Mong đợi: thẻ "Ngôn ngữ trả lời của AI" (en: "AI reply language") liệt kê từng kênh, mặc định "Theo khách" (en: "Match customer").
2. Chọn "English" cho một kênh, bấm Lưu. — Mong đợi: thông báo "Đã lưu ngôn ngữ trả lời." và ô chọn giữ "English".
3. Tải lại trang. — Mong đợi: vẫn "English" (đã lưu DB).
4. Đổi sang "Tiếng Việt", lưu; rồi "Theo khách", lưu. — Mong đợi: mỗi lần đều lưu được.
5. Chuyển giao diện vi ↔ en. — Mong đợi: nhãn và thông báo đổi ngôn ngữ.
6. Đăng nhập Staff, mở `/app/settings`. — Mong đợi: KHÔNG thấy thẻ này.
7. Đọc dòng cuối thẻ. — Mong đợi: nói xưng hô "sắp có" (chờ bảng `brand_voice`).
