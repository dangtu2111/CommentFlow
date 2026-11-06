# Handoff `feat-src-pancake` (claude, làn c)

**Đã làm:** connector Pancake POS chỉ đọc (`packages/connectors/src/pancake/{connector,normalize,fixtures}.ts`), `readPancakeConfig`, kiểu nguồn `pancake` trong `applyProductSourceSync`, env.example (`PANCAKE_ENABLED`), docs riêng (plan, qpan1, can-ban-cung-cap.d, kt-pan/tt-pan, codemap.d/mien-pancake), dòng gap-matrix/MASTER.

**Đã đọc + rút ra:** copy cấu trúc `kiotviet/*`. Khác KiotViet: khóa là `api_key` ở query (URL chứa bí mật → không log/ném URL, lỗi mạng thay bằng thông báo cố định); mã shop số đi vào đường dẫn → kiểm dạng; sản phẩm luôn có `variations`; phân trang `page_number` từ 1 + `total_pages`; không token OAuth; không làm webhook (không rõ chữ ký).

**Verifier-security:** không có mục chặn merge. Đã sửa: trang trống khi còn trang sau → lỗi (không trả danh mục dang dở); id số phải là số nguyên an toàn; `cancel()` thân lỗi bọc try. Để lại: che `api_key` ở lớp theo dõi (Sentry/OTel) khi dựng nơi dùng; hỏi Pancake xem có nhận khóa qua header không; trần tổng byte/thời gian cả lượt `fetchCatalog`; tiền tệ ngoài VND (kiểm khi có shop thật).

**Còn lại:** `PANCAKE-CONNECT-STORE` (bảng mã shop + API key mã hóa theo workspace, làn b), job worker, đối soát, webhook nếu Pancake có chữ ký. Xác nhận tên trường/tham số với shop Pancake thật.
