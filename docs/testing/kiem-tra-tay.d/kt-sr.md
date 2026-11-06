## KT-SR — Kiểm lại ngay trước khi gửi (SEND-RECHECK, FR-110)

Lõi là hàm thuần; đường người gửi (hộp soạn trả lời) đã dùng nó. Bước 1–2 không cần khóa; bước 3–4 cần máy ảo + connector giả/thật (như KT-007).
1. Chạy `pnpm --filter @flow/ai exec vitest run src/recheck` và `pnpm --filter @flow/ai test:mutation`. — Mong đợi: test xanh (mỗi R1–R9 có test trượt riêng, property-based seed cố định); Stryker báo điểm ≥ 80 % cho `send-recheck.ts`.
2. Mở `packages/ai/src/recheck/send-recheck.ts`, xem mảng `RULES`. — Mong đợi: đúng 9 hàm theo thứ tự §6.1; không có chữ `hide`; `mode !== 'auto'` chỉ làm R4/R6/R7 bỏ qua, không có đường nào bỏ qua R1–R3.
3. (vi + en) Mở một bình luận, bấm Gửi; ngay sau đó ở cửa sổ khác bấm Ẩn bình luận đó trước khi worker gửi (hoặc tắt worker, ẩn, bật lại). — Mong đợi: yêu cầu gửi bị hủy, hộp soạn hiện lý do "Bình luận đã bị ẩn hoặc gộp nên không gửi nữa." / "The comment was hidden or merged, so it was not sent." (mã `recheck:R2`), không có bài trả lời trên Page.
4. (vi + en) Ngắt kết nối kênh (hoặc đặt `channels.status = 'expired'` trên `cf_dev`) rồi bấm Gửi. — Mong đợi: trạng thái "Gửi lỗi" với lý do "Kênh đang không kết nối hoặc đang bị tạm khóa gửi." (`recheck:R3`), nút Thử lại; bình luận về `send_failed`.
5. Kiểm sau khi nối tự gửi (`SEND-RECHECK-WIRE`): đổi giá sản phẩm trong khoảng trễ → bản nháp về Chờ duyệt với lý do "Giá hoặc tồn kho đã đổi" (`recheck:R5`); bấm Dừng khẩn cấp → `recheck:R4`.
