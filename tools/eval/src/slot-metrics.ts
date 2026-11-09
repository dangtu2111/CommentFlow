import { suggestPolicyFacts } from '@flow/ai';
import type { EvalSample } from './dataset';
import { isStockSample, type StockDisclosure, termPresent } from './metrics';
import type { SampleOutcome } from './run-sample';

/** Tổng hợp đường fact plan của MỘT lượt đo (`--fact-slots`): từ chối cứng, sự kiện bắt buộc, số ngoài chỗ giữ chỗ, hành động. */
export type SlotSummary = {
  total: number;
  slotted: number;
  rawTexts: number;
  rejected: number;
  /** CỔNG từ chối cứng: số MẪU phải dùng câu dự phòng/chuyển người vì mọi bản của LLM bị từ chối (có ít nhất một bản bị từ chối). */
  fallbackSamples: number;
  /** Id các mẫu đó (để liệt kê từng câu). */
  fallbackSampleIds: string[];
  chosen: Record<string, number>;
  requiredFacts: number;
  knownFacts: number;
  unknownFacts: number;
  clarify: number;
  /** Câu CUỐI còn số tiền/%/ngày/SĐT/link lạ (guard tiền chạy trên giá trị code điền): kỳ vọng 0. */
  finalMoneyViolations: number;
  /** Số lần lưới chặn CUỐI ({fact:…} còn sót sau bước kiểm/điền) kích hoạt — mục tiêu 0. */
  finalNetTriggered: number;
  actions: Record<string, number>;
};

export function summarizeSlots(outcomes: Iterable<SampleOutcome>): SlotSummary {
  const s: SlotSummary = {
    total: 0,
    slotted: 0,
    rawTexts: 0,
    rejected: 0,
    fallbackSamples: 0,
    fallbackSampleIds: [],
    chosen: {},
    requiredFacts: 0,
    knownFacts: 0,
    unknownFacts: 0,
    clarify: 0,
    finalMoneyViolations: 0,
    finalNetTriggered: 0,
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
      if (diag.finalNetTriggered) s.finalNetTriggered += 1;
      if ((diag.chosen === 'fallback' || diag.chosen === 'handoff') && diag.rejected > 0) {
        s.fallbackSamples += 1;
        s.fallbackSampleIds.push(outcome.id);
      }
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
    `- CỔNG từ chối cứng — MẪU phải dùng câu dự phòng/chuyển người vì bị từ chối: ${s.fallbackSamples}/${s.slotted} (${pct(s.fallbackSamples, s.slotted)}; cổng: demo < 5%, sswiftly < 10%)${s.fallbackSampleIds.length > 0 ? ` — ${s.fallbackSampleIds.join(', ')}` : ''}`,
    `- (chỉ theo dõi chi phí, không phải cổng) bản nháp LLM bị từ chối cứng: ${s.rejected}/${s.rawTexts} (${pct(s.rejected, s.rawTexts)}); câu được chọn: ${JSON.stringify(s.chosen)}`,
    `- Sự kiện bắt buộc: ${s.requiredFacts}; đã biết ${s.knownFacts}, chưa biết (câu mời) ${s.unknownFacts}; hỏi lại tỉnh/thành: ${s.clarify}`,
    `- Câu cuối còn số/khẳng định ngoài chỗ giữ chỗ (guard tiền trên giá trị code điền): ${s.finalMoneyViolations}`,
    `- Lưới chặn CUỐI ({fact:…} còn sót) kích hoạt: ${s.finalNetTriggered} (mục tiêu 0)`,
    `- Hành động: ${JSON.stringify(s.actions)}`,
  ].join('\n');
}

/** Phần báo cáo cho `--fact-slots`: tổng hợp + 10 câu mẫu để Owner đọc lời văn. */
export function renderSlotReport(
  samples: readonly EvalSample[],
  outcomes: ReadonlyMap<string, SampleOutcome>,
  shop?: Parameters<typeof renderPolicyDiff>[0],
): string {
  const inner = innerCitySamples(samples);
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
    ...(shop ? [renderPolicyDiff(shop), ''] : []),
    `### Mẫu gắn nhãn "nội thành 20.000đ" (bỏ đúng thiết kế, KHÔNG sửa nhãn): ${inner.length === 0 ? 'không có mẫu nào' : inner.join(', ')}`,
    '',
  ].join('\n');
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );

/**
 * Đối chiếu bản Owner khai (`policyFacts` trong shop file) với bộ ĐỀ XUẤT từ văn bản chính sách của chính shop (cùng bộ như worker dùng khi đồng bộ Shopify).
 * Mỗi dòng: khớp / khác (in cả hai) / chỉ có ở bản khai / chỉ có ở đề xuất.
 */
export function renderPolicyDiff(shop: {
  id: string;
  texts: ReadonlyArray<{ text: string }>;
  policyFacts: ReadonlyArray<{ kind: string; data: unknown }>;
}): string {
  const suggestions = suggestPolicyFacts(shop.texts.map((t) => t.text).join('\n\n'));
  const label = (kind: string, data: unknown) =>
    kind === 'ship_region' ? `ship_region:${(data as { label?: string }).label ?? ''}` : kind;
  const declared = new Map(shop.policyFacts.map((f) => [label(f.kind, f.data), f]));
  const suggested = new Map(suggestions.map((f) => [label(f.kind, f.data), f]));
  const lines: string[] = [];
  for (const key of new Set([...declared.keys(), ...suggested.keys()])) {
    const d = declared.get(key);
    const s = suggested.get(key);
    if (d && s) {
      lines.push(
        stable(d.data) === stable(s.data)
          ? `- KHỚP ${key}`
          : `- KHÁC ${key}\n  khai : ${stable(d.data)}\n  đề xuất: ${stable(s.data)}\n  bằng chứng: ${s.evidence}`,
      );
    } else if (d) {
      lines.push(`- CHỈ BẢN KHAI ${key}: ${stable(d.data)} (bộ đề xuất không rút được từ văn bản)`);
    } else if (s) {
      lines.push(`- CHỈ ĐỀ XUẤT ${key}: ${stable(s.data)}\n  bằng chứng: ${s.evidence}`);
    }
  }
  return [
    `### Đối chiếu bản khai ↔ bộ đề xuất (#294) — ${shop.id}`,
    ...(lines.length > 0 ? lines : ['- (không có dòng nào)']),
  ].join('\n');
}

/** Mẫu gắn nhãn/hỏi "nội thành" (đáp án chứa đúng 20.000 hoặc câu hỏi nêu nội thành): bỏ đúng thiết kế vì chính sách nội thành không nêu tên thành phố — liệt kê riêng, KHÔNG sửa nhãn. */
export function innerCitySamples(samples: readonly EvalSample[]): string[] {
  const exact20k = /(?<![\d.,])20[.,]000(?![\d])/;
  return samples
    .filter((s) => {
      const must = JSON.stringify(s.expected?.mustContain ?? []);
      return exact20k.test(must) || /nội thành|noi thanh|within the city|inner city/i.test(s.text);
    })
    .map((s) => s.id);
}

/** Sự kiện bắt buộc (mustContain) tách: tổng / riêng tồn kho / ngoài tồn kho — chấm theo chế độ nêu tồn của shop. */
export function renderFactBreakdown(
  samples: readonly EvalSample[],
  outcomes: ReadonlyMap<string, SampleOutcome>,
  mode: StockDisclosure,
): string {
  const tally = { all: [0, 0], stock: [0, 0], other: [0, 0] } as Record<string, [number, number]>;
  let unlabeled = 0;
  for (const sample of samples) {
    const must = sample.expected.mustContain;
    const outcome = outcomes.get(sample.id);
    if (must.length === 0 || !outcome) continue;
    const ok = outcome.ok && must.every((term) => termPresent(sample, outcome.reply, term, mode));
    if (sample.expected.factKinds === undefined) unlabeled += 1;
    const group = isStockSample(sample) ? 'stock' : 'other';
    for (const key of ['all', group]) {
      (tally[key] as [number, number])[1] += 1;
      if (ok) (tally[key] as [number, number])[0] += 1;
    }
  }
  const row = (name: string, [passed, total]: [number, number]) =>
    `- ${name}: ${passed}/${total}${total === 0 ? '' : ` (${((passed / total) * 100).toFixed(1)}%)`}`;
  return [
    '',
    '',
    `## Sự kiện bắt buộc (chế độ tồn kho của shop: ${mode === 'quantity' ? 'nêu số lượng' : 'chỉ còn/hết hàng'})`,
    row('Tổng', tally.all as [number, number]),
    row('Riêng tồn kho', tally.stock as [number, number]),
    row('Ngoài tồn kho', tally.other as [number, number]),
    unlabeled > 0
      ? `- Lưu ý: ${unlabeled} mẫu có sự kiện bắt buộc CHƯA có nhãn gold expected.factKinds — được tính vào "ngoài tồn kho"; chủ dự án gán nhãn để tách đúng.`
      : '',
    '',
  ].join(String.fromCharCode(10));
}
