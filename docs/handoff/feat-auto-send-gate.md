# Bàn giao — nhánh `feat-auto-send-gate`

Cập nhật: 2026-11-06 · Mục gap matrix: AUTO-SEND-GATE · Agent vừa làm: claude · Commit cuối: xem `git log -1`
Kế hoạch: `docs/plans/feat-auto-send-gate.md`

## Đã làm
- `packages/ai/src/gate/auto-send-gate.ts`: `decideAutoSend(raw)` — Zod đầu vào; mảng `GATES` 11 hàm đúng thứ tự `docs/09` §6; trượt → `{outcome:'hold', failedGate:'gate:N', reason, gatesPassed}`; qua hết → `auto_send` hoặc `would_send` (Chạy thử ở cổng 2/3). Cổng 6 gồm: `handoff`, `decision.needsHuman`, `policy_never`, `draft.needsHuman` (AI xin duyệt), `checkGuardMoney` toàn văn `reply`, bực/injection/hỏi lại ≥ 3/ảnh chưa nhận, `allow_clarify` (policy gốc `allow_clarify`) + `allow_partial` (policy hiệu lực `allow_partial`, `unanswered_topics` của code hoặc AI, ý `handoff`), sẵn sàng < 80, người giữ chuỗi. `complaint` luôn chặn ở cổng 4; sàn ngưỡng 0,80; giờ hoạt động qua `Intl.DateTimeFormat` (khung qua đêm, `24:00`, `from = to` rỗng); tin nhắn thiếu mốc → chặn cổng 11.
- Test TDD + property-based (seed 20261106): mỗi cổng một ca, thứ tự cổng, đơn điệu (12 "breaker"), bất biến hoán vị, đầu vào hỏng không ném. Ngưỡng nhánh 95% cho `src/gate/*.ts`.
- Q-ASG1, KT-ASG, CAN_BAN §2i, gap matrix (+ `MUTATION-STRYKER`), MASTER, codemap.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `docs/09` §6 | 11 cổng; §6.1 `sendRecheck` R1–R9 là lớp thứ hai lúc gửi (SEND-RECHECK), không thuộc gate |
| `docs/10` `automation_settings` | Khóa unique (workspace, scope, scope_id, target, label, lang); `allow_partial` mặc định false, `allow_clarify` true; `drafts.failed_gate` dạng `gate:5`/`recheck:R5` |
| `decide-action.ts` | `autoSendPolicy` là mức sàn, phải qua `effectiveAutoSendPolicy(policy, draft)`; `needsHuman` của decision ≠ `needs_human` của LLM |
| `guard-money.ts` | `checkGuardMoney({reply, sources, knownPricesVnd?})` → `{ok}`; `exactOptionalPropertyTypes` nên không truyền `undefined` |

## Quyết định đã chốt trong phiên
- Q-ASG1 (xem `QUYET_DINH_CHO_DUYET.md`); Stryker không cài (gap `MUTATION-STRYKER`).
- Kiểm chứng `verifier-security` (một lần): 2 mục chặn merge (ý `fact` của AI mở được cổng qua `effectiveAutoSendPolicy`; `unanswered_topics` của AI bị Zod bỏ) + 5 nên sửa — đã sửa hết, ghi ở Q-ASG1 (h), test hồi quy "FR-031 hồi quy"/"FR-141 hồi quy". Ghi nhận cho bước nối pipeline: `null` ở `dailyCap`/`aiCostCapUsd`/`activeHours` nghĩa là "không giới hạn" — đọc DB lỗi thì KHÔNG gọi cổng (hoặc `hold`), không truyền `null`; chỉ xếp job `send` khi `outcome === 'auto_send'` (không cộng `would_send` vào `autoSentToday`). **Cần bạn quyết định** (chưa đổi code): từ khóa chặn có quét cả câu khách không; bài ghi đè Tự động có được mở khi kênh Tắt không.

## Còn lại (việc khác)
1. Nối pipeline (PIPE-ROUTE/AUTO-MATRIX-UI): hợp nhất `automation_settings` bài → kênh → workspace theo (target, label, lang), đếm `autoSentToday`/`aiCostMonthUsd`, ghi `drafts.failed_gate`/`not_auto_sent_reason`/`automation_events`, đẩy job `send` sau khoảng trễ.
2. Cấp cờ: `customerAngry`, `promptInjection` (PII/injection), `humanHolding` (DA-HOLDER, FR-154), `readinessPercent` (KB-READINESS, FR-146), `imageProductUnresolved` (từ `decideAction.reason = image_product`).
3. SEND-RECHECK R1–R9 (lớp thứ hai) dùng lại `GATE_REASONS`/mã `recheck:R#`.
4. `MUTATION-STRYKER`.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/gate
pnpm --filter @flow/ai test:coverage
```
