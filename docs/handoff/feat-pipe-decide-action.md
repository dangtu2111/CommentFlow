# Bàn giao — nhánh `feat-pipe-decide-action`

Cập nhật: 2026-11-06 · Mục gap matrix: PIPE-DECIDE-ACTION · Agent vừa làm: claude · Commit cuối: xem `git log -1`
Kế hoạch: `docs/plans/feat-pipe-decide-action.md`

## Đã làm
- `packages/ai/src/decide/decide-action.ts`: `decideAction(raw)` — Zod đầu vào; thứ tự: rủi ro (`lang=other`, `complaint` bất kỳ vị trí, `impersonation`, `priceConflict`, `legalUnsourced`, `repeatCount ≥ 3`) → hỏi lại một câu theo ưu tiên (ảnh chưa nhận sản phẩm [cần người] → nhiều mẫu → trục biến thể chưa nói → thiếu chiều cao/cân nặng khi có bảng size → câu mơ hồ; `clarifyCount ≥ 2` → `handoff clarify_limit`) → chuyển hướng (ý thiếu nguồn hoặc `stockStale`; `answeredTopics`/`unansweredTopics` theo thứ tự `KB_GAP_TOPICS`, `redirectTemplates`, `needsSupportTag`) → trả lời. `autoSendPolicy` (`standard`/`allow_clarify`/`allow_partial`/`never`), `askedBefore`. Đầu vào hỏng → `handoff input_unreadable`, không ném.
- `draft/draft-prompt.ts`: `DraftInput.decision?: ActionBrief`; khối hệ thống (cache) thêm hướng dẫn theo hành động + cấm tự tính; khối người dùng thêm dòng `Hành động: …` (gợi ý lựa chọn gộp một dòng, cắt 120 ký tự). `drafter.ts`: `handoff` → `needsHumanResult(REASON_HANDOFF_ACTION)` không gọi LLM; `clarify`/`redirect` không bắt buộc nguồn; `DRAFT_PROMPT_VERSION = draft@2`.
- Test TDD + property-based (seed 20261106); ngưỡng nhánh 95% cho `src/decide/*.ts`.
- Q-PDA1, KT-DA, gap matrix, MASTER, codemap.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `docs/05` FR-147 vs FR-143 | Ảnh chưa nhận ra sản phẩm: FR-147 nói hỏi lại, FR-143/§6 nói cần người → chọn `clarify` + `needsHuman` (Q-PDA1 b) |
| `docs/10` `automation_settings`, `brand_voice.handoff_templates`, `kb_gaps.topic` | Khóa mẫu câu mời: `shipping/discount/order_status/stock_check/other`; chủ đề gap: `shipping/discount/product_info/policy/order_status/size/other` |
| `classify/extract-result.ts` | `ExtractResult` truyền thẳng vào `extract` được (schema `.loose()`), chỉ dùng `labels/refers_to_image/size/color/height_cm/weight_kg` |
| `confidence/confidence.ts` | `ACTION_KINDS` dùng chung; `decision.action` + `askedBefore` là tín hiệu cho `computeConfidence` |

## Quyết định đã chốt trong phiên
- Q-PDA1 (xem `QUYET_DINH_CHO_DUYET.md`).
- Kiểm chứng `verifier-security` (một lần): không có mục chặn merge; 5 mục "Nên sửa" đã sửa hết (Q-PDA1 (g)): `risks` bắt buộc đủ cờ, `order_status` → redirect + cần người, `effectiveAutoSendPolicy`, `escapeSource` cho gợi ý/câu hỏi, dòng cấm nói tồn kho khi `stock_check`. Ghi nhận cho việc sau: AUTO-SEND-GATE phải đọc `ActionDecision.needsHuman`/`autoSendPolicy` (không đọc `draft.needs_human` của LLM) và chạy `checkGuardMoney` trên toàn văn `reply` ở mọi hành động (số trong ý `question_back`/`handoff` không bị `enforceClaimSources` kiểm).

## Còn lại (việc khác)
1. `DA-RULES-PRICE/STOCK/ORDER-HOURS/LEGAL`, `DA-HANDOFF-RULES`: tính các cờ `risks.*` và `products.missingAxes`; FR-153 `order_status` → thêm chuyển người.
2. PIPE-RETRIEVE/PIPE-ROUTE: cấp `topics[{topic,sourced}]`, `products.candidates`.
3. Nối pipeline: ghi `drafts.action`, `kb_gaps` (unansweredTopics), tag Cần hỗ trợ thêm; AUTO-SEND-GATE đọc `effectiveAutoSendPolicy(decision.autoSendPolicy, draft)` + `allow_partial`/`allow_clarify`, và `decision.needsHuman`.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/decide src/draft
pnpm --filter @flow/ai test:coverage
```
