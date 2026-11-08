# Kế hoạch `chore/gap-embedding-sms-decisions` — Ghi gap và quyết định 08/11/2026 vào tài liệu

**Trạng thái duyệt:** Đã duyệt (chủ dự án chốt trực tiếp 08/11/2026: SMS tạm chưa làm, ảnh đại diện dùng SeaweedFS, bỏ `showSampleData()`, ghi 3 gap hậu #267).

## Việc

Mã gap matrix: `SMS-PROVIDER`, `EMBED-SWITCH-PARALLEL-WRITE`, `EMBED-SWITCH-STUCK-ROWS`, `EMBED-SWITCH-BATCHED`, `NOMOCK-04/05/07` · Spec: `docs/decisions/khong-mock-khi-chay-2026-11-08.md`.

**Tóm tắt:** Chỉ cập nhật tài liệu (gap matrix, CAN_BAN_CUNG_CAP) để quyết định của chủ dự án không mất giữa các phiên.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Gap matrix có dòng `SMS-PROVIDER` (chưa lên lịch), ba dòng `EMBED-SWITCH-*`, và `NOMOCK-04/05/07` phản ánh quyết định — kiểm bằng: đọc file.
2. `docs/can-ban-cung-cap.d/nomock-tai-nguyen.md` ghi SMS chưa lên lịch, ảnh đại diện dùng SeaweedFS.
3. `pnpm precheck` xanh.

## File sẽ đọc (≤ ~8, kèm lý do)

`docs/gap-matrix.md`, `docs/can-ban-cung-cap.d/nomock-tai-nguyen.md`.

## File sẽ sửa / tạo

`docs/gap-matrix.md`, `docs/can-ban-cung-cap.d/nomock-tai-nguyen.md`, kế hoạch này.

## Migration

Không có.

## Test viết trước

Không áp dụng (tài liệu).

## Lệnh test phạm vi hẹp

`pnpm precheck`
