import type { EvalSample } from './dataset';
import type { SampleOutcome } from './run-sample';

/** Tổng hợp đường fact plan của MỘT lượt đo (`--fact-slots`): từ chối cứng, sự kiện bắt buộc, số ngoài chỗ giữ chỗ, hành động. */
export type SlotSummary = {
  total: number;
  slotted: number;
  rawTexts: number;
  rejected: number;
  chosen: Record<string, number>;
  requiredFacts: number;
  knownFacts: number;
  unknownFacts: number;
  clarify: number;
  /** Câu CUỐI còn số tiền/%/ngày/SĐT/link lạ (guard tiền chạy trên giá trị code điền): kỳ vọng 0. */
  finalMoneyViolations: number;
  actions: Record<string, number>;
};

export function summarizeSlots(outcomes: Iterable<SampleOutcome>): SlotSummary {
  const s: SlotSummary = {
    total: 0,
    slotted: 0,
    rawTexts: 0,
    rejected: 0,
    chosen: {},
    requiredFacts: 0,
    knownFacts: 0,
    unknownFacts: 0,
    clarify: 0,
    finalMoneyViolations: 0,
    actions: {},
  };
  for (const outcome of outcomes) {
    if (!outcome.ok) continue;
    s.total += 1;
    s.actions[outcome.action] = (s.actions[outcome.action] ?? 0) + 1;
    if (!outcome.slot) continue;
    s.slotted += 1;
    s.requiredFacts += outcome.slot.required;
    s.knownFacts += outcome.slot.known;
    s.unknownFacts += outcome.slot.unknown;
    if (outcome.slot.clarify) s.clarify += 1;
    if (outcome.moneyViolations > 0) s.finalMoneyViolations += 1;
    const diag = outcome.slot.diagnostics;
    if (diag) {
      s.rawTexts += diag.rawTexts;
      s.rejected += diag.rejected;
      s.chosen[diag.chosen] = (s.chosen[diag.chosen] ?? 0) + 1;
    }
  }
  return s;
}

/** Mẫu lời văn để Owner đọc: trải đều trên các lượt đi đường fact plan (không chọn lọc theo chất lượng). */
export function sampleReplies(
  samples: readonly EvalSample[],
  outcomes: ReadonlyMap<string, SampleOutcome>,
  count: number,
): Array<{ id: string; question: string; action: string; reply: string }> {
  const slotted = samples.flatMap((sample) => {
    const o = outcomes.get(sample.id);
    return o?.ok && o.slot
      ? [{ id: sample.id, question: sample.text, action: o.action, reply: o.reply }]
      : [];
  });
  if (slotted.length <= count) return slotted;
  const step = slotted.length / count;
  return Array.from(
    { length: count },
    (_, i) => slotted[Math.floor(i * step)] as (typeof slotted)[number],
  );
}

export function renderSlotSummary(s: SlotSummary): string {
  const pct = (a: number, b: number) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`);
  return [
    '## Đường fact plan (ADR 017)',
    `- Lượt đi đường fact plan: ${s.slotted}/${s.total}`,
    `- Câu LLM bị guard chỗ giữ chỗ TỪ CHỐI CỨNG: ${s.rejected}/${s.rawTexts} (${pct(s.rejected, s.rawTexts)}); câu được chọn: ${JSON.stringify(s.chosen)}`,
    `- Sự kiện bắt buộc: ${s.requiredFacts}; đã biết ${s.knownFacts}, chưa biết (câu mời) ${s.unknownFacts}; hỏi lại tỉnh/thành: ${s.clarify}`,
    `- Câu cuối còn số/khẳng định ngoài chỗ giữ chỗ (guard tiền trên giá trị code điền): ${s.finalMoneyViolations}`,
    `- Hành động: ${JSON.stringify(s.actions)}`,
  ].join('\n');
}

/** Phần báo cáo cho `--fact-slots`: tổng hợp + 10 câu mẫu để Owner đọc lời văn. */
export function renderSlotReport(
  samples: readonly EvalSample[],
  outcomes: ReadonlyMap<string, SampleOutcome>,
): string {
  const lines = sampleReplies(samples, outcomes, 10).map(
    (r) => `- [${r.id}] (${r.action}) KHÁCH: ${r.question}
  TRẢ LỜI: ${r.reply}`,
  );
  return [
    '',
    '',
    renderSlotSummary(summarizeSlots(outcomes.values())),
    '',
    '### 10 câu mẫu (trải đều, không chọn lọc)',
    ...lines,
    '',
  ].join('\n');
}
