# Kế hoạch `feat-send-recheck` — Kiểm tra lại ngay trước khi gửi `sendRecheck` R1–R9 (FR-110)

## Việc

Mã gap matrix: `SEND-RECHECK` · Spec: FR-110 (`docs/05`), `docs/09` §6.1 (bảng R1–R9), ADR 008 §2 (job `send` hiện đã có R1–R3 viết thẳng trong SQL/TS), `docs/14` §2 (mỗi điều kiện một test trượt riêng), `docs/13` (bảng rủi ro "trạng thái đổi trong khoảng trễ").

**Tóm tắt:** Câu trả lời (do nhân viên bấm Gửi hoặc AI tự gửi) có thể nằm trong hàng đợi vài phút; trong lúc đó bình luận có thể đã được trả lời, bị ẩn, kênh mất kết nối, giá đổi, Owner bấm Dừng khẩn cấp… Việc này tách phần "kiểm lại" thành **một hàm thuần** `sendRecheck` (hàm thuần = chỉ nhận dữ liệu đã đo, không gọi DB/mạng) trong `packages/ai/src/recheck/`, kiểm đúng 9 điều kiện R1–R9 theo thứ tự của `docs/09` §6.1 và trả về: qua, hay trượt ở điều kiện nào (`recheck:R#`), lý do (mã), và cách xử lý (hủy / báo lỗi kênh / về Chờ duyệt / hỏi xác nhận / hoãn). Job `send` của worker gọi hàm này thay cho đoạn R1–R3 viết thẳng; mã `recheck:R#` đã được ghi vào `comment_replies.error_code` và web dịch thành lý do dễ hiểu (bổ sung R4–R9). Rủi ro: R4–R8 chưa có nguồn dữ liệu thật (bảng `drafts`, `automation_settings`, `kb_versions` nối pipeline chưa làm; R9 cần bộ đếm Redis `SEND-RATE-LIMIT`) nên ở worker hiện chỉ R1–R3 (+ R9 khi có bộ giới hạn tiêm vào) có dữ liệu — các điều kiện còn lại được hàm thuần kiểm đầy đủ bằng test và sẽ nhận dữ liệu khi nối pipeline tự gửi.

## Điểm chưa rõ

Không có. Tự quyết theo § Quy tắc hỏi, ghi `Q-SR1` ở `docs/plans/QUYET_DINH_CHO_DUYET.md` (hình dạng đầu vào; "chưa có bộ giới hạn tốc độ" thì R9 qua; thiếu dữ liệu ở chế độ tự gửi thì trượt; hiển thị lý do qua `error_code` hiện có; Stryker).

## Tiêu chí nghiệm thu

1. Qua đủ R1–R9 → `{ ok: true, rule: null }`; mỗi điều kiện R1–R9 có **test trượt riêng** trả đúng `rule = recheck:R#`, mã lý do và cách xử lý theo cột "Trượt thì" của §6.1 (R1/R2 hủy; R3 lỗi kênh; R4/R6/R7 về Chờ duyệt; R5 tự gửi → Chờ duyệt "Giá đã đổi", người gửi → hỏi xác nhận; R8 Chờ duyệt/khóa ô soạn; R9 hoãn, không tính là lỗi) — kiểm bằng: `send-recheck.test.ts` (FR-110).
2. Phạm vi áp dụng đúng cột "Áp dụng": R4, R6, R7 **chỉ** chế độ tự gửi (người gửi bỏ qua); R5 chỉ khi câu có số tiền (có ảnh chụp giá); R8 chỉ tin nhắn (24 giờ tự động, 7 ngày khi người gửi có HUMAN_AGENT) — kiểm bằng: `send-recheck.test.ts` (FR-110).
3. Thứ tự: nhiều điều kiện cùng trượt → báo điều kiện **nhỏ nhất**; thiếu dữ liệu ở chế độ tự gửi (không đọc được cài đặt tự động/KB/hạn mức) → trượt (thiên về chặn), không ném; đầu vào hỏng → `rule = input`, không gửi — kiểm bằng: `send-recheck.test.ts` (FR-110).
4. Thuộc tính (fast-check, seed cố định): `ok` ⇔ mọi vị từ R1–R9 đúng; `rule` = điều kiện nhỏ nhất trượt; xác định; đổi thứ tự mảng giá (`price.snapshot`/`price.current`) không đổi kết quả; làm trượt thêm một điều kiện bất kỳ không bao giờ biến "không gửi" thành "gửi" (đơn điệu); dữ liệu tùy ý không ném — kiểm bằng: `send-recheck.test.ts` "property-based" (FR-110).
5. Worker: job `send` gọi `sendRecheck` (chế độ người gửi) và giữ nguyên hành vi R1–R3 hiện có (mã `recheck:R1/R2/R3`, trạng thái bình luận như trước) — kiểm bằng: test đơn vị `apps/worker/src/jobs/send-recheck-input.test.ts` (dựng đầu vào từ dòng SQL) + test tích hợp sẵn có `apps/worker/tests/send.int.test.ts` (chạy ở CI/làn b, không chạy ở làn c).
6. Lý do hiển thị: `replyErrorKey('recheck:R4'…'recheck:R9')` có khóa riêng, chuỗi `vi`/`en` khớp khóa — kiểm bằng: `apps/web/src/lib/reply-state.test.ts`, `pnpm lint:i18n`, test khớp khóa i18n.
7. Coverage `packages/ai` giữ ngưỡng + `src/recheck/*.ts` ≥ 95% nhánh; mutation ≥ 80% mutant bị diệt trên `src/recheck` (Stryker, nếu cài được trong nhánh — xem Q-SR1; không cài được → ghi rõ ở báo cáo và gap `MUTATION-STRYKER`); cổng chung xanh — kiểm bằng: `pnpm --filter @flow/ai test:coverage`, `pnpm --filter @flow/ai test:mutation` (nếu có), lint, lint:i18n, typecheck, depcruise, check:plans, test:trace.

## File sẽ đọc (≤ ~8, kèm lý do)

Đã đọc: `docs/09` §6.1 (bảng R1–R9); ADR 008 (R1–R3 hiện tại, mã lỗi); `apps/worker/src/jobs/send.ts` (nơi nối, `Row`); `apps/worker/src/jobs/send.test.ts` (mẫu test worker); `packages/ai/src/gate/auto-send-gate.ts` + `.test.ts` (mẫu Zod/fast-check, `GATE_REASONS` dùng lại cho R4/R7/R8); `apps/web/src/lib/reply-errors.ts` + `reply-state.test.ts` (ánh xạ mã → khóa i18n); `packages/shared/src/i18n/messages/{vi,en}.json` khối `comments.reply.errors`; `packages/ai/vitest.config.ts`; handoff `feat-auto-send-gate`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/recheck/send-recheck.ts` (Zod đầu vào, 9 hàm R1–R9 theo thứ tự, mã lý do, `RECHECK_LABELS`) + `send-recheck.test.ts` (TDD + property-based).
- Sửa `packages/ai/src/index.ts` (xuất), `packages/ai/vitest.config.ts` (ngưỡng nhánh `src/recheck/*.ts`).
- Sửa `apps/worker/src/jobs/send.ts` (R1–R3 → `sendRecheck`; hàm `recheckInputFromRow` thuần) + tạo `send-recheck-input.test.ts`; `apps/worker/package.json` (thêm phụ thuộc workspace `@flow/ai`).
- Sửa `apps/web/src/lib/reply-errors.ts` (+R4–R9), `reply-state.test.ts`, `packages/shared/src/i18n/messages/{vi,en}.json`.
- Docs: `docs/plans/{QUYET_DINH_CHO_DUYET,MASTER}.md`, `docs/gap-matrix.md` (SEND-RECHECK, MUTATION-STRYKER, SEND-LOCK-CROSS-WORKSPACE ghi chú), `docs/codemap.md`, `docs/CAN_BAN_CUNG_CAP.md`, `docs/testing/KIEM_TRA_TAY.md` (KT-SR), `docs/handoff/feat-send-recheck.md`.

## Migration

Không có (làn c). Dữ liệu cho R4–R8 (`drafts.price_snapshot`/`kb_version`, `automation_settings`, `automation_events.gate = recheck:R#`) đã có trong `docs/10`; ghi/đọc khi nối pipeline tự gửi (ghi gap `SEND-RECHECK-WIRE`).

## Test viết trước

`send-recheck.test.ts` viết trước, chạy đỏ (module chưa có) rồi mới viết mã (`sendRecheck` là logic quy tắc §4 STANDARD).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/recheck` · `pnpm --filter @flow/ai test:coverage` · `pnpm --filter @flow/worker exec vitest run src/jobs/send-recheck-input.test.ts src/jobs/send.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib/reply-state.test.ts`

## Cần kiểm chứng độc lập không?

Có — một lần `verifier-security` (`sendRecheck`: không có đường gửi bỏ qua kiểm; thiếu dữ liệu → chặn; R1–R3 ở worker không đổi hành vi; mã lỗi không mang nội dung/token).

## Rủi ro / câu hỏi cho chủ dự án

Không cần tài nguyên ngoài. Stryker (Apache-2.0) là thư viện dev — xem Complexity tracking.

## Đề xuất thay đổi

Không đổi `docs/01–16`.

## Complexity tracking

- Thêm thư viện dev `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` (Apache-2.0) chỉ ở `packages/ai` để đo mutation ≥ 80% (STANDARD §8, yêu cầu của việc). Phương án đơn giản hơn đã loại: không đo (không có bằng chứng cho tiêu chí 7). Nếu cài/chạy không được với Vitest 5 trong nhánh này → không giữ thay đổi lockfile, ghi lại ở gap `MUTATION-STRYKER`.
- Worker thêm phụ thuộc workspace `@flow/ai` (không phải thư viện ngoài; depcruise không cấm `apps/* → packages/ai`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong `docs/09` §6.1 + FR-110 + ADR 008 + Q-SR1).
