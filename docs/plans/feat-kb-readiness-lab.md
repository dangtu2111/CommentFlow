# Kế hoạch `feat/kb-readiness-lab` — Gộp Độ sẵn sàng AI và Bộ câu kiểm thử

Mã gap matrix: `AI-READINESS` + `KB-TESTSET` · Spec: FR-146, FR-054.

**Tóm tắt:** Gộp hai trang Cơ sở kiến thức ("Độ sẵn sàng AI" và "Câu kiểm thử") thành MỘT trang `/app/readiness` theo thiết kế Stitch "Readiness & Test Lab" (`design/stitch/kb-readiness-lab.html`): thẻ điểm + 4 trụ cột + AI Coach + bộ câu kiểm thử (lọc/tìm kết quả) + sandbox. Dùng lại backend sẵn có (`loadReadiness`, `runKbTestSetAction`, `runTryAiAction`), không migration. Trang cũ `/app/kb-testset` chuyển hướng sang trang mới. Rủi ro thấp: chỉ giao diện + gom điều hướng.

## Điểm chưa rõ

Quyết định: bộ câu kiểm thử CHƯA được lưu (thiết kế vẽ 24 kịch bản lưu sẵn, cần bảng DB + migration riêng → đề xuất làm sau, hỏi chủ dự án); số liệu "rủi ro ảo giác", "điểm /25" mỗi trụ cột, thời gian phản hồi trong thiết kế là dữ liệu mẫu, KHÔNG có nguồn thật nên không dựng (thay bằng "x/y câu mẫu trả lời được" từ `computeReadiness`).

## Tiêu chí nghiệm thu

1. `/app/readiness` hiện điểm, dải điểm, mục bắt buộc, 4 trụ cột, AI Coach từ dữ liệu thật — kiểm bằng: `lib/readiness-lab.test.ts`, mở trang.
2. Bộ câu kiểm thử chạy được, kết quả lọc theo Đạt/Không đạt/Lỗi và tìm kiếm — kiểm bằng: `readiness-test-lab.test.tsx`, `readiness-lab.test.ts`.
3. `/app/kb-testset` chuyển sang `/app/readiness#test-lab`; menu không còn mục "Câu kiểm thử" riêng — kiểm bằng: `app-nav.test.ts`, `require-app-user.scan.test.ts`.

## File sẽ đọc

`app/(guarded)/readiness/page.tsx`, `kb-testset/*`, `components/kb/kb-frame.tsx`, `lib/app-nav.ts`, `lib/kb-structure.ts`, `packages/ai/src/readiness/readiness.ts`, `packages/ai/src/try/test-set.ts`.

## File sẽ sửa / tạo

Tạo: `lib/readiness-lab.ts`, `components/readiness/readiness-overview.tsx`, `readiness-test-lab.tsx`, `design/stitch/kb-readiness-lab.{html,png}`. Sửa: trang readiness, `app-nav`, `kb-structure`, `kb-frame`, `shell-nav`, i18n vi/en. Chuyển: `kb-testset/actions.ts` → `readiness/test-lab-actions.ts`. Xóa: `readiness-view.tsx`, `components/kb-testset/*`.

## Migration

Không có.

## Test viết trước

`readiness-lab.test.ts` (dải điểm, trụ cột, gợi ý, lọc), `readiness-test-lab.test.tsx`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/readiness-lab.test.ts src/components/readiness`

## Cần kiểm chứng độc lập không?

Không (không đụng auth/RLS/cổng tự gửi/migration; Owner-only giữ nguyên).

## Trạng thái duyệt

Đã duyệt (chủ dự án yêu cầu trực tiếp).
