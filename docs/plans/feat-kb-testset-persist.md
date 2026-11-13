# Kế hoạch `feat/kb-testset-persist` — Lưu bộ câu kiểm thử trên trang Độ sẵn sàng & Kiểm thử

Mã gap matrix: `KB-TESTSET-PERSIST` · Spec: FR-054, US-034.

**Tóm tắt:** Trang "Độ sẵn sàng AI & Kiểm thử" trước đây chỉ chạy bộ câu một lần rồi quên. Thêm bảng `cf.kb_test_cases` để LƯU bộ câu của shop (câu hỏi, hành động mong đợi, từ khóa) cùng kết quả lần chạy cuối; Owner thêm/xóa câu, bấm "Chạy lại cả bộ" (chia lượt ≤ 20 câu), lọc theo Đạt/Không đạt/Lỗi/Chưa chạy. Rủi ro thấp: migration chỉ thêm bảng + 3 hàm, Owner-only, có đường lùi.

## Điểm chưa rõ

Không có. Quyết định: chỉ lưu kết quả LẦN CHẠY CUỐI (không lịch sử); tối đa 100 câu/workspace, mỗi lượt chạy ≤ 20 câu, hạn mức 10 lượt/ngày giữ nguyên (Q-KTS1); chưa chặn nút Xuất bản bằng bộ câu (việc sau, cần chủ dự án duyệt).

## Tiêu chí nghiệm thu

1. Owner thêm câu, thấy lại sau khi tải trang; Staff và workspace khác không thấy/không sửa được — kiểm bằng: `packages/db/tests/kb-test-cases.int.test.ts` (CI job Database).
2. Chạy cả bộ ghi kết quả từng câu; tỷ lệ chính xác chỉ tính câu đã chạy — kiểm bằng: `readiness-lab.test.ts`, `readiness-test-lab.test.tsx`.
3. Giới hạn 20 câu/lần, 100 câu/workspace, giá trị sai bị chặn ở DB — kiểm bằng: int test.

## File sẽ đọc

`migrations/0092_publish_media.sql` (mẫu), `packages/db/src/publish-media.ts`, `server/kb-testset.ts`, `readiness/test-lab-actions.ts`.

## File sẽ sửa / tạo

Tạo: `migrations/0096_kb_test_cases.sql` (+ journal), `packages/db/src/kb-test-cases.ts`, `tests/kb-test-cases.int.test.ts`, `server/kb-test-cases.ts`. Sửa: `runtime.ts`, `server/kb-testset.ts` (nhận mảng câu), `test-lab-actions.ts`, `readiness-test-lab.tsx`, `readiness/page.tsx`, `lib/readiness-lab.ts`, i18n.

## Migration

`0096_kb_test_cases`: bảng `cf.kb_test_cases` (RLS, chỉ Owner SELECT) + hàm DEFINER `add_kb_test_cases`, `delete_kb_test_case`, `record_kb_test_run` (Owner only). Chỉ thêm. Đường lùi ở đầu file: DROP 3 hàm rồi DROP TABLE.

## Test viết trước

Int test quyền/giới hạn; test hàm thuần lọc/đếm/tỷ lệ; test render component.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/readiness-lab.test.ts src/components/readiness`; DB: `pnpm test:db` (CI).

## Cần kiểm chứng độc lập không?

Có migration → phiên chính tự kiểm theo `docs/workflows/verify.md` (tự kiểm, chưa có kiểm chứng độc lập): RLS bật + chỉ Owner SELECT; ghi chỉ qua hàm DEFINER có `search_path` cố định và kiểm Owner; workspace lấy từ ngữ cảnh phiên, không từ tham số; không DROP/RENAME/đổi kiểu bảng cũ.

## Trạng thái duyệt

Đã duyệt (chủ dự án yêu cầu "Thêm backend vào" và đã cho quyền migration chỉ-thêm có đường lùi).
