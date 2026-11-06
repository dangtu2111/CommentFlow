# Bàn giao — nhánh `feat-pipe-confidence`

Cập nhật: 2026-11-06 · Mục gap matrix: PIPE-CONFIDENCE · Agent vừa làm: claude · Commit cuối: xem `git log -1`
Kế hoạch: `docs/plans/feat-pipe-confidence.md`

## Đã làm
- `packages/ai/src/confidence/confidence.ts`: `computeConfidence(raw, weights)` — Zod tín hiệu (`pLabel`, `sProduct`, `sRetrievalTop1/2`, `factSourcedRatio`, `action`, `askedBefore`), sigmoid theo §6.0, trọng số `default@1`; trường lạ (số model tự chấm) bị bỏ; đầu vào hỏng/hành động lạ → `{confidence: 0, needsHuman: true, reason: 'Kết quả AI không đọc được', components: null}` (FR-032); `handoff` luôn cần người.
- `assess-draft.ts`: `readDraftOutcome` (không ném), `factSourcedRatio` từ `claims` (nguồn ngoài tập cho phép không tính), `assessDraft`.
- Test TDD + property-based (fast-check, seed 20261106); ngưỡng nhánh 95% theo file trong `vitest.config.ts`.
- Q-PC1, KT-PC, gap matrix, MASTER, codemap.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `draft/draft-result.ts` | `DraftResult.claims[]` có `kind`/`source_ids`; `enforceClaimSources` đã ép `needs_human` khi fact thiếu nguồn → ratio < 1 chỉ xảy ra khi người gọi không chạy bước đó |
| `classify/extract-result.ts` | `labels[0].confidence` = ứng viên cho `pLabel` (tín hiệu ml/logprob), không phải điểm cuối |
| `docs/09` §6.0 | Công thức + "lưu từng thành phần"; ngưỡng cổng 5 theo (kênh, nhãn, ngôn ngữ) — thuộc AUTO-SEND-GATE |

## Quyết định đã chốt trong phiên
- Q-PC1 (xem `QUYET_DINH_CHO_DUYET.md`): trọng số mặc định; tín hiệu thiếu = 0; hành động lạ → 0; không nối `checkGuardMoney` (cổng 6).
- Kiểm chứng `verifier-security` (một lần): không có mục chặn merge; 6 mục "Nên sửa" đã sửa hết (Q-PC1 (f)): không-fact ở câu `answer` → ratio 0, `allowedSourceIds` bắt buộc, thiếu top2 → margin 0, Zod trọng số, try/catch `assessDraft`, lý do cố định `REASON_DRAFT_NEEDS_HUMAN`. Ghi nhận còn lại: khi nối pipeline phải bảo đảm `pLabel` chỉ đến từ ml/logprob/tự nhất quán, không từ JSON AI tự ghi.

## Còn lại (việc khác)
1. AUTO-SEND-GATE: so `confidence` với ngưỡng theo kênh×nhãn×ngôn ngữ (mặc định 0,85, sàn 0,80); ghi `drafts.confidence`/`confidence_components`.
2. PIPE-DECIDE-ACTION: cấp `action` và `askedBefore`; PIPE-RETRIEVE cấp `sRetrievalTop1/2`, `sProduct`.
3. AUTO-CALIBRATION: hồi quy logistic → `ConfidenceWeights` theo (kênh, nhãn, ngôn ngữ).

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/confidence
pnpm --filter @flow/ai test:coverage
```
