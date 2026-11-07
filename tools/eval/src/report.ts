import { type EvalSample, LANG_GROUP_LABELS, LANG_GROUPS } from './dataset';
import { type EvalMetrics, judge, THRESHOLDS, type Verdict } from './metrics';
import type { UsageRecord } from './recording-llm';
import type { SampleOutcome } from './run-sample';

/**
 * Báo cáo EVAL-RUNNER: bảng chỉ số §4.2 theo nhóm ngôn ngữ, chi phí/1.000 lượt TÁCH theo bước (extract / rewrite / draft,
 * tính cả token suy luận), kiểm token suy luận ≈ 0, và kết luận. Bộ `synthetic` KHÔNG BAO GIỜ cho kết luận "đạt cổng".
 */
export const STEPS = ['extract', 'rewrite', 'draft'] as const;
export type Step = (typeof STEPS)[number];

/** "≈ 0" = trung bình ≤ 5 token suy luận mỗi lần gọi (kiểm `reasoning_effort` thấp nhất thật sự có hiệu lực). */
export const REASONING_NEAR_ZERO_MAX_AVG = 5;

export type StepCost = {
  step: Step | 'other';
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  costUsd: number;
  /** Chi phí mỗi 1.000 LƯỢT (chia cho số mẫu, không phải số lần gọi): bước rewrite chỉ gọi khi câu ngắn/mơ hồ. */
  usdPer1000: number;
  avgReasoningPerCall: number;
  reasoningNearZero: boolean;
};

export type CostReport = {
  turns: number;
  steps: StepCost[];
  totalUsdPer1000: number;
  overBudget: boolean;
};

export function costReport(
  outcomes: ReadonlyMap<string, SampleOutcome>,
  turns: number,
  budgetUsdPer1000: number = THRESHOLDS.maxUsdPer1000,
): CostReport {
  const records: UsageRecord[] = [...outcomes.values()].flatMap((outcome) => outcome.usage);
  const known = new Set<string>(STEPS);
  const stepOf = (record: UsageRecord): Step | 'other' =>
    known.has(record.step) ? (record.step as Step) : 'other';
  const names: (Step | 'other')[] = [...STEPS, 'other'];
  const steps = names
    .map((step): StepCost => {
      const own = records.filter((record) => stepOf(record) === step);
      const sum = (pick: (record: UsageRecord) => number) =>
        own.reduce((total, record) => total + pick(record), 0);
      const costUsd = sum((record) => record.costUsd);
      const reasoningTokens = sum((record) => record.reasoningTokens);
      const avg = own.length === 0 ? 0 : reasoningTokens / own.length;
      return {
        step,
        calls: own.length,
        inputTokens: sum((record) => record.inputTokens),
        outputTokens: sum((record) => record.outputTokens),
        cachedTokens: sum((record) => record.cachedTokens),
        reasoningTokens,
        costUsd,
        usdPer1000: turns === 0 ? 0 : (costUsd / turns) * 1000,
        avgReasoningPerCall: avg,
        reasoningNearZero: avg <= REASONING_NEAR_ZERO_MAX_AVG,
      };
    })
    .filter((cost) => cost.calls > 0 || (STEPS as readonly string[]).includes(cost.step));
  const totalUsdPer1000 = steps.reduce((total, cost) => total + cost.usdPer1000, 0);
  return { turns, steps, totalUsdPer1000, overBudget: totalUsdPer1000 > budgetUsdPer1000 };
}

export type GateVerdict = {
  /** `n/a` = bộ mẫu không đủ điều kiện để báo đạt/không đạt cổng (synthetic, thiếu mẫu). */
  status: 'pass' | 'fail' | 'n/a';
  reasons: string[];
};

export function gateVerdict(
  samples: readonly EvalSample[],
  metrics: EvalMetrics,
  cost: CostReport,
): GateVerdict {
  const reasons: string[] = [];
  if (samples.some((sample) => sample.source !== 'real')) {
    reasons.push(
      'Có mẫu `synthetic`: chỉ để chạy thử runner, KHÔNG dùng để chọn model hay báo đạt cổng.',
    );
  }
  for (const group of LANG_GROUPS) {
    const n = metrics.byGroup[group].samples;
    if (n < THRESHOLDS.minPerGroup) {
      reasons.push(
        `Nhóm "${LANG_GROUP_LABELS[group]}" có ${n} mẫu (< ${THRESHOLDS.minPerGroup} tối thiểu).`,
      );
    }
  }
  if (reasons.length > 0) return { status: 'n/a', reasons };
  for (const group of LANG_GROUPS) {
    for (const verdict of judge(metrics.byGroup[group])) {
      if (verdict.pass === false)
        reasons.push(
          `${LANG_GROUP_LABELS[group]}: ${verdict.name} = ${verdict.value} (cần ${verdict.threshold}).`,
        );
    }
  }
  if (cost.overBudget) {
    reasons.push(
      `Chi phí ${cost.totalUsdPer1000.toFixed(2)} USD/1.000 lượt > ${THRESHOLDS.maxUsdPer1000}.`,
    );
  }
  return { status: reasons.length === 0 ? 'pass' : 'fail', reasons };
}

const usd = (value: number) => `$${value.toFixed(value < 0.1 ? 4 : 3)}`;
const mark = (verdict: Verdict) => (verdict.pass === null ? '➖' : verdict.pass ? '✅' : '❌');

export type ReportInput = {
  title: string;
  config: Record<string, string>;
  samples: readonly EvalSample[];
  metrics: EvalMetrics;
  cost: CostReport;
  outcomes: ReadonlyMap<string, SampleOutcome>;
};

export function renderReport(input: ReportInput): string {
  const { samples, metrics, cost } = input;
  const verdict = gateVerdict(samples, metrics, cost);
  const lines: string[] = [`# ${input.title}`, ''];
  if (samples.some((sample) => sample.source !== 'real')) {
    lines.push(
      '> ⚠ **Bộ mẫu `synthetic`** — chỉ để chạy thử runner. KHÔNG dùng để chọn model, KHÔNG dùng để báo đạt cổng (Cổng 2 cần bộ ~300 bình luận thật).',
      '',
    );
  }
  lines.push(
    '## Cấu hình',
    '',
    ...Object.entries(input.config).map(([key, value]) => `- ${key}: ${value}`),
    '',
  );
  const failed = [...input.outcomes.values()].filter((outcome) => !outcome.ok);
  const kinds = new Map<string, number>();
  for (const outcome of failed)
    if (!outcome.ok) kinds.set(outcome.errorKind, (kinds.get(outcome.errorKind) ?? 0) + 1);
  lines.push(
    `Số mẫu: ${samples.length} · lần chạy lỗi: ${failed.length}` +
      (kinds.size > 0
        ? ` (${[...kinds].map(([kind, count]) => `${kind}: ${count}`).join(', ')})`
        : ''),
    '',
  );

  lines.push('## Chỉ số theo nhóm ngôn ngữ (docs/14 §4.2)', '');
  for (const group of LANG_GROUPS) {
    const groupMetrics = metrics.byGroup[group];
    lines.push(
      `### ${LANG_GROUP_LABELS[group]} — ${groupMetrics.samples} mẫu`,
      '',
      '| | Chỉ số | Giá trị | Ngưỡng |',
      '|---|---|---|---|',
    );
    for (const item of judge(groupMetrics))
      lines.push(`| ${mark(item)} | ${item.name} | ${item.value} | ${item.threshold} |`);
    lines.push('');
  }

  lines.push(
    '## Chi phí mỗi 1.000 lượt, tách theo bước',
    '',
    '| Bước | Số lần gọi | Token vào | Token ra | Token cache | Token suy luận | TB suy luận/lần | USD / 1.000 lượt |',
    '|---|---|---|---|---|---|---|---|',
  );
  for (const step of cost.steps) {
    lines.push(
      `| ${step.step} | ${step.calls} | ${step.inputTokens} | ${step.outputTokens} | ${step.cachedTokens} | ${step.reasoningTokens} | ${step.avgReasoningPerCall.toFixed(1)} ${step.calls === 0 ? '' : step.reasoningNearZero ? '✅' : '❌'} | ${usd(step.usdPer1000)} |`,
    );
  }
  lines.push(
    '',
    `**Tổng: ${usd(cost.totalUsdPer1000)} / 1.000 lượt** (trần ${THRESHOLDS.maxUsdPer1000} USD) ${cost.overBudget ? '❌ VƯỢT TRẦN' : '✅'}`,
    `Token suy luận ≈ 0 (TB ≤ ${REASONING_NEAR_ZERO_MAX_AVG}/lần): ${cost.steps.filter((step) => step.calls > 0).every((step) => step.reasoningNearZero) ? '✅ đạt' : '❌ KHÔNG đạt — kiểm `reasoning_effort`'}`,
    '',
  );

  lines.push(
    '## Kết luận',
    '',
    verdict.status === 'pass'
      ? '✅ **ĐẠT** mọi ngưỡng §4.2 và chi phí.'
      : verdict.status === 'fail'
        ? '❌ **KHÔNG ĐẠT**:'
        : '⚪ **KHÔNG ÁP DỤNG (n/a)**:',
  );
  for (const reason of verdict.reasons) lines.push(`- ${reason}`);
  lines.push('');
  return lines.join('\n');
}
