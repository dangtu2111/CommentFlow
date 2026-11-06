# Kế hoạch `feat-auto-send-gate` — Cổng tự gửi `decideAutoSend` (FR-031, FR-141)

## Việc

Mã gap matrix: `AUTO-SEND-GATE` · Spec: FR-031, FR-141 (`docs/05`), `docs/09` §6 (11 cổng, §6.0), `docs/03` M05/M08, `docs/10` (`drafts.failed_gate`/`not_auto_sent_reason`, `automation_settings`, `automation_events`).

**Tóm tắt:** Thêm vào `packages/ai` một hàm thuần `decideAutoSend` (không gọi LLM, không DB): nhận các sự kiện đã đo được (công tắc workspace, mức kênh × nhãn, ghi đè bài, nhãn, độ tin cậy do code tính, quyết định hành động của `decideAction`, bản nháp, cờ "cần người", từ khóa chặn, số đã gửi trong ngày, chi phí AI, giờ hoạt động, cửa sổ 24 giờ) và **code** kiểm 11 cổng đúng thứ tự `docs/09` §6. Trượt cổng nào → "Chờ duyệt" kèm `failed_gate = gate:N` + mã lý do; qua hết → `auto_send` (mức Tự động) hoặc `would_send` (Chạy thử). AI chỉ có thể **thêm** điều kiện "cần duyệt" (`draft.needsHuman = true` làm trượt cổng 6), không bao giờ mở cổng; module không có đường nào ra lệnh ẩn bình luận. Rủi ro: chưa nối pipeline/DB (ghi `drafts`, `automation_events`, đọc `automation_settings` là việc sau); các cờ "khách rất bực", "prompt injection", "người đang giữ chuỗi", "độ sẵn sàng" do bước khác cấp — ở đây chỉ nhận cờ.

## Điểm chưa rõ

Không có. Tự quyết (Q-ASG1 ở `QUYET_DINH_CHO_DUYET.md`): hình dạng đầu vào (giá trị đã được bước đọc DB hợp nhất theo thứ tự bài → kênh → workspace); Chạy thử vẫn chạy đủ 11 cổng rồi trả `would_send`; đầu vào hỏng → chờ duyệt `failed_gate = input`; Stryker chưa cài (không có cấu hình sẵn, thêm thư viện + đổi lockfile khi nhiều làn song song) → ghi gap `MUTATION-STRYKER`.

## Tiêu chí nghiệm thu

1. Qua đủ 11 cổng ở mức Tự động → `outcome = auto_send`, `failedGate = null`; mức Chạy thử → `would_send` — kiểm bằng: `auto-send-gate.test.ts` (FR-031).
2. Mỗi cổng 1–11 có test riêng làm trượt đúng cổng đó với `failedGate = gate:N` và mã lý do đúng; cổng 4 kiểm **mọi** nhãn trong `labels[]` (FR-145); cổng 5 so với ngưỡng (mặc định 0,85, sàn 0,80: ngưỡng cài < 0,80 bị nâng lên 0,80); cổng 6 gồm: tiền/SĐT/link không có trong nguồn (`checkGuardMoney` trên toàn văn `reply`), khách rất bực, dấu hiệu injection, hỏi lại ≥ 3, ảnh chưa nhận sản phẩm, `unanswered_topics` mà `allow_partial` tắt, câu `clarify`/`redirect` không có ý `fact` xét `allow_clarify`, `handoff` không bao giờ, độ sẵn sàng < 80%, người đang giữ chuỗi, `decision.needsHuman`, `draft.needsHuman`; cổng 11 chỉ áp dụng cho tin nhắn — kiểm bằng: `auto-send-gate.test.ts` (FR-031, FR-141, FR-145, FR-146, FR-147, FR-154).
3. Thứ tự cổng: khi nhiều cổng cùng trượt, `failedGate` là cổng **nhỏ nhất**; không có đường nào đổi thứ tự — kiểm bằng: `auto-send-gate.test.ts` "thứ tự cổng" (FR-031).
4. AI chỉ thêm "cần duyệt": `draft.needsHuman = false` không mở được cổng nào; `draft.needsHuman = true` luôn chặn; module không bao giờ trả hành động ẩn (`AUTO_SEND_OUTCOMES` không chứa `hide`) — kiểm bằng: `auto-send-gate.test.ts` (FR-031).
5. Đầu vào hỏng (không phải object, số âm, nhãn lạ, ngày không hợp lệ) → `hold`, `failedGate = input`, không ném — kiểm bằng: `auto-send-gate.test.ts` (FR-031, FR-032).
6. Thuộc tính (fast-check, seed cố định): `auto_send`/`would_send` ⇔ mọi vị từ cổng đều đúng; `failedGate` = cổng nhỏ nhất trượt; xác định; **đổi thứ tự** `labels`/`blockedKeywords`/`blockedLabels`/`claims`/`sources` không đổi kết quả; làm trượt thêm một cổng bất kỳ không bao giờ biến `hold` thành gửi (đơn điệu); dữ liệu tùy ý không ném — kiểm bằng: `auto-send-gate.test.ts` "property-based" (FR-031).
7. Ngưỡng coverage `packages/ai` giữ (100% dòng) + `src/gate/*.ts` ≥ 95% nhánh; cổng chung xanh — kiểm bằng: `pnpm --filter @flow/ai test:coverage`, lint, lint:i18n, typecheck, depcruise, check:plans, test:trace.

## File sẽ đọc (≤ ~8, kèm lý do)

Đã đọc: `docs/09` §6, §6.0, §6.1 (11 cổng, ranh giới với `sendRecheck`); `docs/03` M05, M08; `docs/05` FR-031, FR-141, FR-146, FR-154, FR-163; `docs/10` dòng `drafts`, `automation_settings`, `automation_events`; `packages/ai/src/decide/decide-action.ts` (`ActionDecision`, `effectiveAutoSendPolicy`); `confidence/confidence.ts` (`ACTION_KINDS`); `guard-money.ts` (`checkGuardMoney` chữ ký); `packages/shared/src/search.ts` (`normalizeSearchText` cho từ khóa chặn); `decide-action.test.ts` (mẫu fast-check); handoff `feat-pipe-decide-action`, `feat-pipe-confidence`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/gate/auto-send-gate.ts` (Zod đầu vào, 11 cổng, mã lý do, `GATE_LABELS`) + `auto-send-gate.test.ts` (TDD + property-based).
- Sửa `packages/ai/src/index.ts` (xuất), `packages/ai/vitest.config.ts` (ngưỡng nhánh `src/gate/*.ts`), `docs/testing/KIEM_TRA_TAY.md` (KT-ASG), `docs/CAN_BAN_CUNG_CAP.md` (mục 2i), `docs/plans/{MASTER,QUYET_DINH_CHO_DUYET}.md`, `docs/gap-matrix.md` (dòng AUTO-SEND-GATE + `MUTATION-STRYKER`), `docs/codemap.md`, `docs/handoff/feat-auto-send-gate.md`.

## Migration

Không có (làn c không thêm migration; cột `drafts.failed_gate`/`not_auto_sent_reason`, bảng `automation_settings`/`automation_events` đã có trong `docs/10`, ghi khi nối pipeline).

## Test viết trước

`auto-send-gate.test.ts` viết trước, chạy đỏ (module chưa có) rồi mới viết mã (cổng tự gửi là logic quy tắc §4 STANDARD).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/gate` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — một lần `verifier-security` (cổng tự gửi §6: kiểm "không có đường để JSON AI mở cổng", thứ tự cổng cố định, thiên về chặn khi thiếu dữ liệu, không ẩn bình luận).

## Rủi ro / câu hỏi cho chủ dự án

Không cần tài nguyên ngoài, không gọi LLM/DB. Stryker chưa cài (xem Q-ASG1) — khi cài sẽ chạy trên `src/gate`, `src/decide`, `src/guard-money.ts`.

## Đề xuất thay đổi

Không đổi `docs/01–16`.

## Complexity tracking

Không có (không thêm thư viện: `fast-check`, `zod` đã có; `Intl.DateTimeFormat` của Node cho giờ địa phương).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong `docs/09` §6 + FR-031/FR-141 + Q-ASG1).
