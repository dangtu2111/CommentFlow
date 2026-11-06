## KT-LEX — Xuất khách tiềm năng CSV/XLSX (LEADS-EXPORT, feat-leads-export) — chỉ làm được khi đã nối nguồn thật + giao diện

> Hiện chưa có giao diện/nguồn DB (gap `LEADS-EXPORT-WIRE`); các bước dưới dành cho lúc đã nối. Kiểm tự động đã phủ phần lõi: `pnpm --filter @flow/shared exec vitest run src/lead-export.test.ts`.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Cờ tắt, bấm "Xuất" | Bị từ chối, không có tệp |
| 2 | Bật cờ ở workspace THỬ, Staff xuất CSV | Tệp mở bằng Excel đúng tiếng Việt; cột SĐT chỉ `••••••` + 4 số cuối |
| 3 | Tạo lead thử có tên `=1+1`, xuất CSV rồi XLSX | Excel hiện nguyên chữ `'=1+1`, không tính công thức |
| 4 | Staff yêu cầu xuất SĐT đầy đủ | Bị từ chối |
| 5 | Owner (cấu hình `full`) yêu cầu đầy đủ | Ra số đầy đủ; có dòng nhật ký xuất |
| 6 | Đặt `LEADS_EXPORT_MAX_ROWS` nhỏ hơn số lead rồi xuất | Báo "quá lớn", không có tệp cắt dở |
