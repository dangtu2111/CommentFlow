# Handoff `feat-src-sapo` (claude, làn c)

**Đã làm:** connector Sapo chỉ đọc (`packages/connectors/src/sapo/*`), `readSapoConfig`, kiểu nguồn `sapo` trong `applyProductSourceSync`, env.example, docs riêng (plan, qsap1, can-ban-cung-cap.d, kt-sap/tt-sap, codemap.d/mien-sapo), dòng gap-matrix/MASTER.

**Đã đọc + rút ra:** copy cấu trúc `haravan/*`. Khác Haravan: tên miền cửa hàng theo người dùng → ép `^…\.mysapo\.net$`; header token `X-Sapo-Access-Token`; mốc xuất bản `published_on`; không dùng tham số `published_status` (không chắc Sapo hỗ trợ), lọc ở normalize.

**Verifier-security:** không có mục chặn merge. Lưu ý cho route webhook sau này: chỉ dùng webhook làm tín hiệu gọi lại `fetchCatalog` của đúng shop đã kết nối (header tên shop không được ký), chống trùng theo `event_hash`; nơi nhận tên shop nên `trim()` + chữ thường.

**Còn lại:** `SAPO-CONNECT-STORE` (OAuth + bảng token, làn b), job worker, route webhook, đối soát. Xác nhận tên trường với shop Sapo thật.
