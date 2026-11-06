# Handoff `feat-da-impersonation` (claude, làn c)

## Đã làm
- `packages/ai/src/decide/impersonation-rules.ts`: `evaluateImpersonation` thuần (FR-155, Q-DIM1); test + property-based; export ở `decide/index.ts`.
- Docs: plan, `q-dim1.md`, codemap fragment, `kt-dim.md`/`tt-dim.md`, gap-matrix (dòng DA-IMPERSONATION), MASTER.

## Đã đọc và rút ra
- `decideAction` đã chuyển người khi `risks.impersonation` (lý do `impersonation`); `try-pipeline.ts` đang hard-code `false`.
- Cột `comments.is_impersonation_suspected` đã có (migration 0019) → không cần migration.

- `verifier-security`: không có mục "Chặn merge". Đã sửa: ReDoS tên miền, `pageNames` rỗng/toàn ký tự không so được → `unreadable`, bỏ từ chung (Store/Official/CSKH) khi so tên, chuẩn hóa Cyrillic cho cả nội dung.

## Còn lại
- Chưa sửa (ghi nhận): bảng ký tự giống Latin theo UTS #39, so tên theo tập từ (đảo thứ tự), `ck` đứng riêng, tự xưng không có "là", SĐT tách bằng `*_/`.
- Khi nối: `unreadable` → `input_unreadable` của `decideAction`; chỉ `suspected && !unreadable` mới thành `risks.impersonation` (tránh báo mạo danh nhầm).
- `DA-IMPERSONATION-WIRE`: pipeline truyền tên tác giả + tên Page/shop + cờ tác giả là Page → `risks.impersonation`; ghi cột, nhãn đỏ "Nghi mạo danh", báo ngay, nút Ẩn do người bấm (cổng `fb-hide` đã có); cân nhắc kiểm lại trong `sendRecheck`.
- Tinh chỉnh từ khóa theo dữ liệu thật; chưa bắt số đọc bằng chữ.
