# Bàn giao `feat-data-export` (agent: claude)

**Đã làm:** DATA-EXPORT (FR-094) Xong-mock — migration 0056 `core.data_exports`, job `data-export`, kho tệp cục bộ, dọn hết hạn/kẹt, nút ở trang Quyền riêng tư, cờ `DATA_EXPORT_ENABLED` TẮT. Q-EXP1.

**Chưa chạy được trong phiên này:** `pnpm test:db` (gồm `data-export.int.test.ts`) và `pnpm db:check-rls` — lệnh cần DB/phê duyệt. Người điều phối/CI chạy; cần `CF_LANE=b`.

**Còn lại / nợ (từ verifier, không chặn merge):**
- `DATA-EXPORT-DELIVERY`: tải tệp + email link (object storage, SMTP).
- Dọn tệp chỉ chạy khi worker bật cờ (có `DATA_EXPORT_DIR`); tắt cờ sau khi đã xuất → tệp cũ không tự xóa. Tệp `.tmp` mồ côi khi worker chết giữa chừng chưa được quét.
- `expireDataExports` đánh `expired` trước khi xóa tệp (xóa lỗi từng tệp chỉ log, không thử lại).
- `claimDataExport` chưa đối chiếu `requested_by` với job; `external_id`/`post_id` còn trong tệp; `maskPii` chỉ che SĐT/email (tên, địa chỉ, STK chưa).
- Đếm 5 yêu cầu/24h tính cả `failed`.
