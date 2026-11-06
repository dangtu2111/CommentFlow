## 2q. `AUTO-CONFIG-STORE` (FR-070/071) — không cần tài nguyên ngoài
Lưu cấu hình tự gửi vào DB (`cf.automation_settings`, `cf.automation_rules`, migration 0047). Chỉ cần **chủ dự án duyệt và chạy migration 0047 lên staging/production qua CI có duyệt** (agent không chạy lệnh ghi lên các DB đó). Không cần khóa hay dịch vụ ngoài.
