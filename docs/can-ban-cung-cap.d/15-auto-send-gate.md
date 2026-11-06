## 2i. `AUTO-SEND-GATE` (FR-031, FR-141) — không cần tài nguyên ngoài

Hàm thuần `decideAutoSend` (`packages/ai/src/gate/`), không khóa/dịch vụ/cờ; kiểm tay mã KT-ASG. Không có gì để chủ dự án cung cấp. Mutation testing (Stryker) chưa cài — xem gap `MUTATION-STRYKER`, cần bạn đồng ý thêm thư viện dev (Apache-2.0) ở một nhánh riêng.
