# Kế hoạch `feat-push-email` — Thông báo đẩy PWA + email (giờ yên lặng, gom, lựa chọn)

Mã gap matrix: `PUSH-EMAIL` · Spec: docs/05 FR-084 (không có mục riêng ở docs/09).

**Tóm tắt:** Dựng "bộ não" gửi thông báo: người dùng chọn sự kiện nào gửi qua kênh nào (đẩy PWA hoặc email), có giờ yên lặng theo múi giờ và gom nhiều thông báo thành một. Nhà cung cấp thật (Web Push/VAPID, SMTP) nằm sau interface và chỉ có bản giả (mock) trong lần này; cờ mặc định TẮT. Rủi ro: lưu lựa chọn + đăng ký push cần bảng DB — không thêm migration ở làn c, ghi gap cho làn b.

## Điểm chưa rõ

Không có. Tự chọn phương án an toàn, ghi ở Q-PE1: sự kiện khẩn (lỗi kênh/token hết hạn, cảnh báo hạn mức) vượt giờ yên lặng; còn lại hoãn tới hết giờ yên lặng; nội dung thông báo không chứa văn bản bình luận/PII, chỉ nhãn chung + số lượng.

## Tiêu chí nghiệm thu

1. Lựa chọn người dùng: sự kiện×kênh tắt thì không gửi; dữ liệu hỏng → mặc định an toàn — kiểm bằng `notification-prefs.test.ts`.
2. Giờ yên lặng: đúng múi giờ, khung qua đêm, biên đúng giờ; sự kiện thường hoãn tới hết giờ yên lặng, sự kiện khẩn đi ngay — kiểm bằng test ví dụ + fast-check (lũy đẳng/đơn điệu của mốc hoãn).
3. Gom: các mục cùng (người dùng, kênh) trong cửa sổ gộp thành một bản tóm tắt ≤ trần, giữ đủ số lượng theo loại; chỉ còn 1 mục thì gửi lẻ — kiểm bằng test.
4. Nội dung thông báo không chứa SĐT/email/văn bản khách — kiểm bằng test + fast-check.
5. Dispatcher: cờ TẮT → không gọi nhà cung cấp; push trả "gone" → báo đăng ký hết hạn để xóa; lỗi một kênh không làm hỏng kênh kia, không nuốt lỗi — kiểm bằng test với mock.
6. Cấu hình đọc từ env (`PUSH_EMAIL_ENABLED` mặc định TẮT, khóa VAPID chỉ TÊN biến) — kiểm bằng test + `env.example`.
7. `pnpm lint`, `typecheck`, `depcruise`, `check:plans`, `test:trace`, `--filter @flow/shared test:coverage` xanh.

## File sẽ đọc
`packages/shared/src/lead-export.ts` (mẫu cờ/config), `packages/shared/src/index.ts` (export), `env.example`.

## File sẽ sửa / tạo
- `packages/shared/src/notification-prefs.ts` (+test): lựa chọn, giờ yên lặng, quyết định giao.
- `packages/shared/src/notification-digest.ts` (+test): gom + dựng nội dung không PII.
- `packages/shared/src/notification-channels.ts` (+test): interface `PushProvider`/`EmailProvider`, mock, cấu hình, `createNotificationDispatcher`.
- `packages/shared/src/index.ts`, `env.example`, docs (gap-matrix, MASTER, codemap.d, quyet-dinh/qpe1.md, can-ban-cung-cap.d, kiem-tra-tay.d, handoff).

## Migration
Không có (làn c). Gap cho làn b: `PUSH-EMAIL-STORE` — bảng `notification_prefs` (user×workspace) + `push_subscriptions` (endpoint/khóa mã hóa) + hàng đợi gom; RLS theo người dùng.

## Test viết trước
Cả ba file logic (quy tắc giờ yên lặng, gom, PII).

## Lệnh test phạm vi hẹp
`pnpm --filter @flow/shared exec vitest run src/notification-*.test.ts`

## Cần kiểm chứng độc lập không?
Có, một lần `verifier-security`: phần khóa VAPID/đăng ký push (endpoint là bí mật nhẹ) và che PII trong nội dung.

## Rủi ro / câu hỏi cho chủ dự án
Cần (sau này): cặp khóa VAPID, SMTP thật; chọn nhà cung cấp email.

## Đề xuất thay đổi
Thêm mục FR-084 vào docs/09 khi nối thật (bằng lời).

## Complexity tracking
Không có (không thư viện mới; mock tự viết; interface có ≥2 bản: thật + mock theo ngoại lệ connector).

## Checklist plan
- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định theo Q-PE1, không migration).
