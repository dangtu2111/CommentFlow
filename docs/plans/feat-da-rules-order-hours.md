# Kế hoạch `feat-da-rules-order-hours` — Hỏi đơn hàng + câu mời theo giờ làm việc

## Việc

Mã gap matrix: `DA-RULES-ORDER-HOURS` · Spec: FR-153, FR-152 (`docs/05`), `docs/09` §4 (`decideAction`), `docs/10` (`brand_voice.handoff_templates` {inHours,outHours}).

**Tóm tắt:** Hai hàm thuần mới. (1) Nhận ra khách đang hỏi đơn hàng ("đơn đến đâu", "sao chưa giao", "where is my order") để gắn chủ đề `order_status` chưa có nguồn → `decideAction` (đã có sẵn nhánh FR-153) chuyển hướng ib + chuyển người + ghi `kb_gaps`; "chốt đơn/đặt đơn" (mua hàng) không bị nhầm. (2) Chọn câu mời chuyển hướng/chuyển người theo giờ làm việc của workspace: trong giờ dùng mẫu `inHours`, ngoài giờ dùng mẫu `outHours`; mẫu ngoài giờ lỡ hứa "gọi ngay/trả lời ngay" bị thay bằng câu mặc định "shop phản hồi từ <giờ mở cửa kế tiếp>". Rủi ro thấp: không DB/LLM, chỉ thêm tín hiệu thiên về chuyển người; chưa nối pipeline/DB.

## Điểm chưa rõ

Không có (xem Q-DROH1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. `detectOrderStatusIntent` đúng với câu hỏi tình trạng đơn (vi có/không dấu, en), sai với mua hàng/hỏi giá/rỗng/không phải chuỗi — test + property-based (không ném, bất biến theo dấu/hoa thường).
2. `withOrderStatusTopic` thêm/ép `order_status` `sourced=false`; không đổi khi không phải hỏi đơn; không nhân đôi — test.
3. `decideAction` với chủ đề từ `withOrderStatusTopic` → `redirect`, `reason=order_status`, `needsHuman`, `needsSupportTag`, `unansweredTopics` có `order_status`, mẫu `order_status`, `autoSendPolicy=never` — test tích hợp hàm.
4. `evaluateBusinessHours`: trong/ngoài giờ đúng theo múi giờ; ca biên đúng giờ mở (trong) và đúng giờ đóng (ngoài); khung qua đêm; chưa cấu hình/hỏng → `unknown` (dùng câu ngoài giờ, không hứa); `nextOpening` đúng hôm nay/ngày mai/tuần sau — test.
5. `resolveInvitation`: `answer`/`clarify` → `null`; `redirect` → mẫu theo từng khóa; `handoff` → khóa `other`; trong giờ → `inHours`, ngoài/unknown → `outHours`; thiếu mẫu shop → mặc định theo `lang`; mẫu ngoài giờ có cụm hứa ngay (có/không dấu, vi/en) → thay bằng mặc định; mẫu trong giờ giữ nguyên — test + property-based (ngoài giờ không bao giờ chứa cụm hứa ngay).
6. Module ≥ 95% nhánh (glob `src/decide/*.ts`) — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`docs/codemap.md`, `docs/05` FR-152/153, `packages/ai/src/decide/decide-action.ts`, `packages/ai/src/gate/auto-send-gate.ts` (`isWithinActiveHours`, `localDayMinute`, `activeHoursSchema`), `packages/shared/src/kb-content.ts` (mẫu câu mời), `packages/shared/src/products.ts` (`foldText`).

## File sẽ sửa / tạo

- `packages/ai/src/decide/order-hours-rules.ts` (+ `order-hours-rules.test.ts`) — hàm thuần mới.
- `packages/ai/src/index.ts` — xuất.
- `docs/codemap.md` (dòng riêng), `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/CAN_BAN_CUNG_CAP.md`, `docs/handoff/feat-da-rules-order-hours.md`.

## Migration

Không có (chỉ làn b). Nơi lưu giờ làm việc workspace (cột/bảng) chưa có → nối ở `DA-RULES-ORDER-HOURS-WIRE` (gap matrix). Hàm nhận `hours` dạng `ActiveHours` đã có.

## Test viết trước

`order-hours-rules.test.ts`: mọi nhánh, biên giờ mở/đóng, qua đêm, múi giờ, Unicode/dấu, rỗng/rác; property-based (`fast-check` đã cài): detector không ném và bất biến dấu/hoa thường; ngoài giờ không hứa ngay; `resolveInvitation` không ném với đầu vào rác.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/decide/order-hours-rules.test.ts src/decide/decide-action.test.ts` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không — không chạm auth/RLS/thanh toán/cổng tự gửi/`sendRecheck`/che PII; chỉ thêm tín hiệu chuyển người và chọn văn mẫu.

## Rủi ro / câu hỏi cho chủ dự án

Không chặn. Chưa nối pipeline/DB (`DA-RULES-ORDER-HOURS-WIRE`). Nhận diện hỏi đơn bằng từ khóa có thể thiếu cách nói lạ → phần còn lại vẫn do nhãn/LLM phân loại cấp `topics`.

## Đề xuất thay đổi

Không sửa docs/01–16.

## Complexity tracking

Không có (không thư viện mới).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-DROH1).
