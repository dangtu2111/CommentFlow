# Handoff `feat-src-haravan` (claude, làn d)

**Đã làm:** connector Haravan chỉ đọc (`packages/connectors/src/haravan/*`), cờ `readHaravanConfig`, kiểu nguồn `haravan` cho `applyProductSourceSync`, env.example, docs riêng (Q-HRV1, KT-HRV, CBCC, codemap). Test + property-based xanh; coverage connectors/shared giữ ngưỡng.

**Đã đọc + rút ra:** mẫu Shopify (connector/normalize/webhook/fixtures); `products_source_check` đã có `haravan` (migration 0034) nên không cần migration.

**Còn lại:** `HARAVAN-CONNECT-STORE` (OAuth + bảng token cửa hàng — làn b), job worker đồng bộ, route webhook, đối soát, giao diện; kiểm với shop Haravan thật (tên trường chưa kiểm).
