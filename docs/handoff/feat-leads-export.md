# Handoff `feat-leads-export` (claude, làn d)

## Đã làm
Lõi thuần xuất khách tiềm năng CSV/XLSX: `packages/shared/src/lead-export.ts` + test (ví dụ + property-based), export ở `index.ts`, tên biến ở `env.example`, docs riêng (Q-LEX1, codemap.d, cbcc.d, KT-LEX). Không migration/giao diện.

## Đã đọc và rút ra
- `reports.ts` có `csvCell` (chống công thức nhưng không xử lý khoảng trắng đầu/ký tự điều khiển) → viết `sanitizeExportText` riêng, mạnh hơn, lũy đẳng.
- `product-import/xlsx.ts` `readXlsx` dùng để round-trip test; bị giới hạn `IMPORT_MAX_ROWS` nên chỉ test bảng nhỏ.
- `queries/leads.ts` `listLeads` không trả bản mã; nguồn thật cần `getLeadCipher` + `lead-vault` để giải mã khi `revealContacts`.
- Cờ trong repo chỉ nhận đúng `true`; ở đây giá trị lạ → lỗi cấu hình (an toàn hơn).

## Còn lại (`LEADS-EXPORT-WIRE`)
Nguồn DB thật (`LeadExportSource` bọc `listLeads` + giải mã cho Owner), nhật ký xuất (`action_logs`/bảng — migration chỉ làn b), route tải, hàng đợi cho xuất lớn, nút Xuất ở UI Kanban.
