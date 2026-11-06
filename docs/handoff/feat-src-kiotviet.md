# Handoff `feat-src-kiotviet` (claude, làn c)

**Đã làm:** connector KiotViet chỉ đọc (`packages/connectors/src/kiotviet/{connector,token,normalize,webhook,fixtures}.ts`), `readKiotVietConfig`, kiểu nguồn `kiotviet` trong `applyProductSourceSync`, env.example (`KIOTVIET_ENABLED`, `KIOTVIET_WEBHOOK_SECRET`), docs riêng (plan, qkio1, can-ban-cung-cap.d, kt-kio/tt-kio, codemap.d/mien-kiotviet), dòng gap-matrix/MASTER.

**Đã đọc + rút ra:** copy cấu trúc `sapo/*`. Khác Sapo: máy chủ cố định (không SSRF) nhưng tên cửa hàng đi vào header `Retailer` → kiểm dạng; token xin riêng qua client credentials (`token.ts`, có đệm + gộp lời gọi đồng thời); biến thể là dòng riêng có `masterProductId` → gom ở connector; phân trang bằng offset `currentItem`; không có header bucket (chỉ 429); chữ ký webhook `X-Hub-Signature: sha256=<hex>`.

**Còn lại:** `KIOTVIET-CONNECT-STORE` (bảng tên cửa hàng + Client ID/Secret mã hóa theo workspace, làn b), job worker, route webhook, đối soát, lọc tồn theo chi nhánh. Xác nhận tên trường/tham số/định dạng chữ ký với shop KiotViet thật.
