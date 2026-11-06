## 2j. `SEND-RECHECK` (FR-110) — không cần tài nguyên ngoài

Hàm thuần `sendRecheck` (`packages/ai/src/recheck/`) + job `send` của worker gọi nó; không khóa/dịch vụ/cờ mới; kiểm tay mã KT-SR. Đã thêm thư viện dev Stryker (Apache-2.0) để đo mutation — không cần bạn cung cấp gì. Khi nối tự gửi (`SEND-RECHECK-WIRE`), R5–R7 đọc `drafts`/`products`/`usage_counters` (bảng do làn b).
