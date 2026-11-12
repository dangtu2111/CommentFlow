# Kế hoạch `feat/kb-testlab-ui` — dựng giao diện Bộ câu kiểm thử (kb-testlab)

## Việc

Mã gap matrix: UI KB (Phần 4a). Yêu cầu chủ dự án 11/11/2026: "làm hết các màn stitch đã có cho cơ sở tri thức".

**Tóm tắt (2–3 câu dễ hiểu):** Trang `/app/kb-testset` dựng lại theo `design/stitch/kb-testlab.html` bằng Tailwind: thẻ nhập danh sách câu kiểm thử (mỗi dòng một ca) và bảng kết quả từng ca (mong đợi vs thực tế, lý do trượt). Chức năng chạy bộ câu giữ nguyên. Phần thiết kế chưa có nền tảng (lưu bộ hồi quy chuẩn, lọc theo nhóm, tìm theo mã, thêm ca lẻ, số liệu độ trễ/phiên bản mẫu) không dựng, không số mẫu.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Form giữ nhãn/nút/nội dung mẫu cũ; kết quả hiển thị đúng dữ liệu của lần chạy.
2. Không tràn ngang ở 1440/390.
3. typecheck, `lint:i18n`, biome xanh; `ui:fidelity kb-testlab`: lệch 17/45 chỉ số (nền 19/45).

## File sẽ đọc / sửa

Sửa `components/kb-testset/{kb-testset-form,kb-testset-result}.tsx`, `app/app/(guarded)/kb-testset/page.tsx`. Ảnh sau ở `docs/plans/ui-fidelity/kb-testlab/`.

## Migration

Không.

## Test viết trước

Không áp dụng (trình bày; hành vi giữ nguyên).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web typecheck && pnpm lint:i18n`; E2E ở CI.

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Đủ thành phần chữ thấp (6,2%) vì phần lớn chữ thiết kế là dữ liệu mẫu bịa; cố ý không dựng.
