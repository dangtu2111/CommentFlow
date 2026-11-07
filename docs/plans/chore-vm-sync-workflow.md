# Kế hoạch `chore/vm-sync-workflow` — Quy trình giữ máy ảo không tụt lại so với main

**Trạng thái duyệt:** Đã duyệt (chủ dự án yêu cầu 07/11/2026: ghi vào docs/workflows rằng mỗi lần merge PR đổi infra/ phải `pnpm cf:dev sync main`).

## Việc

Mã gap matrix: không có (tài liệu quy trình) · Spec: `docs/decisions/002-hai-may.md`.

**Tóm tắt:** Máy ảo (cf-dev) có checkout riêng không tự cập nhật; ngày 07/11/2026 nó tụt từ PR #239 xuống #125. Ghi quy trình bắt buộc: merge PR đổi `infra/` thì chạy `pnpm cf:dev sync main`, kiểm container lệch bằng băm cấu hình (không in bí mật), dựng lại chỉ dịch vụ cần bằng `up -d --no-deps` (không `down`, không xóa volume). Chỉ sửa tài liệu, không đổi mã.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Có `docs/workflows/may-ao-dong-bo.md` nêu quy tắc, lệnh kiểm chỉ đọc, lệnh dựng lại, các lưu ý (`--no-deps`, không in `config`) — kiểm bằng: đọc file.
2. `docs/workflows/finish.md` có bước 9 trỏ tới file đó — kiểm bằng: đọc file.
3. `pnpm precheck` xanh.

## File sẽ đọc (≤ ~8, kèm lý do)

`docs/workflows/finish.md`, `scripts/lib/cf-dev-command.mjs` (lệnh được phép).

## File sẽ sửa / tạo

`docs/workflows/may-ao-dong-bo.md` (mới), `docs/workflows/finish.md`.

## Migration

Không có.

## Test viết trước

Không áp dụng (tài liệu).

## Lệnh test phạm vi hẹp

`pnpm precheck`

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Không có.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking
