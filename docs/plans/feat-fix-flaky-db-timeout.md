# Kế hoạch `feat/fix-flaky-db-timeout` — nguyên nhân gốc hai test DB quá 30 giây (FLAKY-DB-TIMEOUT)

**Trạng thái duyệt:** Đã duyệt (chủ dự án yêu cầu 07/11/2026: tìm nguyên nhân gốc trước khi lên staging, KHÔNG tăng timeout để che).

## Việc

Mã gap matrix: `FLAKY-DB-TIMEOUT`.

**Tóm tắt:** Hai test `staging-migrate.int.test.ts` ("DB đã áp migration mới hơn mã → CONFLICT, không ghi" và test chạy ngay sau) thỉnh thoảng thất bại ở lần chạy cả bộ. Điều tra: KHÔNG phải khóa/thuê lượt chờ nhau (các test này không đụng `pipeline_turns`; log `pg_stat_activity` khi chạy cả bộ chỉ có chờ khóa tư vấn 10 giây là hành vi THIẾT KẾ của test "khóa tư vấn", không có DDL nào chờ khóa). Nguyên nhân gốc: mỗi câu lệnh migration là một vòng gọi mạng tới DB trên máy ảo (đo 200 lượt `SELECT 1`: p50 4,75 ms, p95 8 ms, tối đa 12,3 ms); cả lịch sử có 930 câu lệnh ⇒ ~7,5 giây MỘT lần áp (đo 7,4–7,6 giây), và thời gian này tăng theo từng migration mới. Các test dùng cả lịch sử thật để kiểm logic (lệch lịch sử, DB mới hơn mã) nên áp 3–4 lần/tệp, sát trần 30 giây khi mạng chậm (gấp ~4 lần). Khi một test quá giờ, lần áp vẫn chạy nền và GIỮ khóa tư vấn → test kế tiếp thấy CONFLICT trong ~300 ms (đây là thất bại thứ hai quan sát được). Sửa đúng gốc: các test kiểm logic dùng thư mục migration TIỀN TỐ (3–4 mục) thay vì cả lịch sử; chỉ MỘT test "chạy thật" áp toàn bộ lịch sử thật. Không đổi timeout, không đổi mã sản phẩm.

## Điểm chưa rõ

Chưa tái hiện được thất bại theo yêu cầu (không giả lập được độ trễ mạng); kết luận dựa trên số đo thời gian và cơ chế thác đổ. Phần còn lại sát trần: test "chạy thật" (~7,2 giây) và global-setup vẫn tỉ lệ với số câu lệnh × độ trễ mạng — xem "Rủi ro".

## Tiêu chí nghiệm thu

1. Test "lịch sử lệch" và "DB mới hơn mã" giảm từ ~7,5 giây xuống ~1,1–1,3 giây mà vẫn kiểm đúng cùng hành vi (CONFLICT, không ghi) — kiểm bằng: `staging-migrate.int.test.ts` (đo thời gian từng test).
2. Vẫn có đúng MỘT test áp toàn bộ lịch sử migration thật ("chạy thật") — kiểm bằng: cùng file.
3. Không thay đổi timeout nào; không đổi mã `src/` — kiểm bằng: diff.
4. Cả bộ DB tích hợp xanh — kiểm bằng: `pnpm test:db` (db).

## File sẽ sửa

`packages/db/tests/staging-migrate.int.test.ts`; tài liệu: gap-matrix (`FLAKY-DB-TIMEOUT` → xong + việc còn lại), Q-FLK1.

## Migration

Không có.

## Cần kiểm chứng độc lập không?

Không (chỉ test; không đụng đường migrate thật).

## Rủi ro / câu hỏi cho chủ dự án

Thời gian áp toàn bộ lịch sử (test "chạy thật", global-setup, CI migrate) vẫn ∝ số câu lệnh × độ trễ mạng (~7,5 giây hôm nay, tăng theo migration mới). Cách giảm tiếp (gộp mỗi migration thành MỘT lệnh nhiều câu) đổi bộ chạy migration của staging nên KHÔNG tự làm — ghi đề xuất để chủ dự án quyết nếu cần.

## Đề xuất thay đổi

Cân nhắc sau (cần duyệt): gộp các câu lệnh của một migration thành một truy vấn nhiều câu trong `runStagingMigrate`/`migrate` để giảm ~12 lần số vòng gọi mạng.

## Complexity tracking

Không đi ngược nguyên tắc nào.
