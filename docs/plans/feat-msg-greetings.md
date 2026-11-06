# Kế hoạch feat-msg-greetings — Tin chào, ngoài giờ, báo chuyển nhân viên

## Việc

Mã gap matrix: `MSG-GREETINGS` · Spec: FR-074 (docs/05), FR-152, docs/09 §6.1 (R8: 24 giờ), docs/12 §1 (Private Reply 1 tin ≤ 7 ngày).

**Tóm tắt:** Thêm hàm thuần `selectGreeting` quyết định có gửi tin tự động nào cho khách nhắn tin (Messenger) hay không — tin chào lần đầu, tin ngoài giờ làm việc, hoặc câu báo "đã chuyển nhân viên" — và chọn mẫu câu theo ngôn ngữ khách (vi/en; ngôn ngữ khác dùng ngôn ngữ dự phòng của shop). Mặc định mọi loại TẮT (Owner bật). Tuân luật Meta: chỉ trong cửa sổ 24 giờ kể từ tin khách; không dùng đường nhắn riêng từ bình luận (nó chỉ có 1 tin). Chưa giao diện, chưa nối DB/gửi thật, không migration.

## Điểm chưa rõ

Không có. Tự chọn (Q-MSG1): chỉ kênh tin nhắn; mặc định TẮT; tin chào 1 lần/hội thoại; ngoài giờ/báo chuyển người có thời gian chờ (mặc định 12 giờ, ≤ 24); chưa cấu hình giờ làm việc → không gửi tin "ngoài giờ"; mẫu ngoài giờ lỡ hứa "gọi ngay" bị thay bằng câu mặc định.

## Tiêu chí nghiệm thu

1. Tin nhắn đầu của khách trong giờ → tin chào; ngoài giờ → tin ngoài giờ nêu giờ mở cửa kế tiếp — test ví dụ.
2. Mẫu chọn theo ngôn ngữ: vi/en theo nhận diện (kênh cố định thắng), `other` → ngôn ngữ dự phòng; thiếu mẫu shop → mẫu mặc định — test.
3. Tin cuối của khách > 24 giờ (hoặc chưa có) → không gửi, mọi loại — test biên ±1 ms + property.
4. Đích là bình luận, người gửi là Page, tắt cấu hình, nhân viên đang xử lý (chỉ với tin chào/ngoài giờ), đã chào, còn trong thời gian chờ → chặn đúng mã/thứ tự G1–G8 — test từng nhánh.
5. Báo chuyển nhân viên dùng mẫu trong/ngoài giờ; mẫu ngoài giờ có cụm hứa ngay bị thay — test + property (văn bản ngoài giờ không bao giờ hứa ngay).
6. Đầu vào hỏng không ném, trả chặn `input_unreadable`; văn bản gửi đi không còn `{…}` — property.

## File sẽ đọc

`order-hours-rules.ts` (evaluateBusinessHours, promisesImmediateReply — đã đọc), `gate/lang-autosend.ts` (resolveReplyLang), `private-reply-check.ts` (mẫu), `decide/index.ts`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/greetings/{greetings.ts,greetings.test.ts,index.ts}`; thêm 1 dòng export ở `packages/ai/src/index.ts`; export thêm từ `decide/index.ts` các hàm giờ làm việc nếu cần.
- Docs bằng file riêng: `docs/plans/quyet-dinh/qmsg1.md`, `docs/codemap.d/bay-msg-greetings-fr-074.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-msg1.md`; sửa dòng gap matrix/MASTER của việc; handoff.

## Migration

Không có. Nơi lưu cấu hình theo kênh + mốc "đã chào/đã báo" cần cột/bảng → gap `MSG-GREETINGS-WIRE` (làn b).

## Test viết trước

Toàn bộ `greetings.test.ts` (ví dụ + biên + fast-check) trước mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/greetings` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không (hàm thuần, không auth/RLS/gửi thật; cổng tự gửi và `sendRecheck` không đổi — nơi gửi sau này vẫn phải qua `sendRecheck` R8).

## Rủi ro / câu hỏi cho chủ dự án

Khi nối thật, tin gửi phải qua `sendRecheck` (R8, 24 giờ) và ghi `automation_events`; mẫu của shop do Owner viết, biến mẫu chỉ `{shop_name}`/`{opening}` nên không có số tiền.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt.** (Mọi quyết định đã có trong spec/ADR hoặc ghi ở Q-MSG1.)
