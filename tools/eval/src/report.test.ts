import { describe, expect, it } from 'vitest';
import type { EvalSample } from './dataset';
import { LANG_GROUPS } from './dataset';
import { computeMetrics } from './metrics';
import type { UsageRecord } from './recording-llm';
import { costReport, gateVerdict, REASONING_NEAR_ZERO_MAX_AVG, renderReport } from './report';
import type { SampleOutcome } from './run-sample';

const usage = (step: string, over: Partial<UsageRecord> = {}): UsageRecord => ({
  step,
  model: 'm',
  inputTokens: 1000,
  outputTokens: 100,
  cachedTokens: 0,
  reasoningTokens: 0,
  costUsd: 0.001,
  ...over,
});

const ok = (id: string, records: UsageRecord[]): SampleOutcome => ({
  ok: true,
  id,
  label: 'price',
  action: 'answer',
  reason: 'answer',
  unansweredTopics: [],
  needsHuman: false,
  autoSendPolicy: 'allow',
  riskReasons: {},
  lang: 'vi',
  reply: 'giá 150.000đ',
  variants: [],
  confidence: 0.9,
  moneyViolations: 0,
  replyViolations: [],
  extract: null,
  searchQuery: 'q',
  rewriteSource: null,
  usage: records,
});

const sample = (
  id: string,
  group: EvalSample['group'],
  source: EvalSample['source'],
): EvalSample => ({
  id,
  source,
  group,
  category: 'normal',
  text: 'x',
  hasMedia: false,
  expected: {
    lang: 'vi',
    label: 'price',
    action: 'answer',
    extract: {},
    mustContain: [],
    forbidden: [],
  },
});

describe('EVAL-RUNNER chi phí mỗi 1.000 lượt, tách theo bước', () => {
  it('chia chi phí từng bước cho SỐ LƯỢT (không phải số lần gọi): bước ít gọi (rewrite) rẻ hơn', () => {
    const outcomes = new Map<string, SampleOutcome>([
      ['a', ok('a', [usage('extract', { costUsd: 0.002 }), usage('draft', { costUsd: 0.01 })])],
      [
        'b',
        ok('b', [
          usage('extract', { costUsd: 0.002 }),
          usage('rewrite', { costUsd: 0.001 }),
          usage('draft', { costUsd: 0.01 }),
        ]),
      ],
    ]);
    const report = costReport(outcomes, 2);
    const by = Object.fromEntries(report.steps.map((s) => [s.step, s]));
    expect(by.extract).toMatchObject({ calls: 2, usdPer1000: expect.closeTo(2, 6) });
    expect(by.rewrite).toMatchObject({ calls: 1, usdPer1000: expect.closeTo(0.5, 6) });
    expect(by.draft?.usdPer1000).toBeCloseTo(10, 6);
    expect(report.totalUsdPer1000).toBeCloseTo(12.5, 6);
    expect(report.overBudget).toBe(true);
  });

  it('dưới trần $2/1.000 lượt thì không vượt; trần tùy chỉnh được', () => {
    const outcomes = new Map([['a', ok('a', [usage('draft', { costUsd: 0.0005 })])]]);
    expect(costReport(outcomes, 1).overBudget).toBe(false);
    expect(costReport(outcomes, 1, 0.1).overBudget).toBe(true);
  });

  it('token suy luận được cộng và kiểm "≈ 0" (TB ≤ ngưỡng mỗi lần gọi)', () => {
    const zero = costReport(new Map([['a', ok('a', [usage('extract'), usage('draft')])]]), 1);
    expect(zero.steps.every((s) => s.reasoningNearZero)).toBe(true);
    const heavy = costReport(
      new Map([
        ['a', ok('a', [usage('draft', { reasoningTokens: REASONING_NEAR_ZERO_MAX_AVG + 100 })])],
      ]),
      1,
    );
    expect(heavy.steps.find((s) => s.step === 'draft')).toMatchObject({
      reasoningNearZero: false,
      reasoningTokens: REASONING_NEAR_ZERO_MAX_AVG + 100,
    });
  });

  it('bước lạ gộp vào "other"; không có mẫu → 0 và không chia cho 0', () => {
    const report = costReport(new Map([['a', ok('a', [usage('khác', { costUsd: 0.5 })])]]), 1);
    expect(report.steps.find((s) => s.step === 'other')?.costUsd).toBe(0.5);
    const empty = costReport(new Map(), 0);
    expect(empty.totalUsdPer1000).toBe(0);
    expect(empty.steps.map((s) => s.step)).toEqual(['extract', 'rewrite', 'draft']);
  });
});

describe('EVAL-RUNNER kết luận cổng', () => {
  const realSamples = (perGroup: number) =>
    LANG_GROUPS.flatMap((group) =>
      Array.from({ length: perGroup }, (_, i) => sample(`${group}${i}`, group, 'real')),
    );
  const outcomesOf = (samples: readonly EvalSample[]) =>
    new Map(samples.map((s) => [s.id, ok(s.id, [usage('draft', { costUsd: 0.0001 })])]));

  it('có mẫu synthetic → n/a, KHÔNG BAO GIỜ "đạt" dù số liệu đẹp', () => {
    const samples = LANG_GROUPS.flatMap((g) =>
      Array.from({ length: 30 }, (_, i) => sample(`${g}${i}`, g, i === 0 ? 'synthetic' : 'real')),
    );
    const outcomes = outcomesOf(samples);
    const verdict = gateVerdict(
      samples,
      computeMetrics(samples, outcomes),
      costReport(outcomes, samples.length),
    );
    expect(verdict.status).toBe('n/a');
    expect(verdict.reasons.join(' ')).toContain('synthetic');
  });

  it('thiếu mẫu (< 30/nhóm) → n/a và nêu nhóm nào', () => {
    const samples = realSamples(5);
    const outcomes = outcomesOf(samples);
    const verdict = gateVerdict(
      samples,
      computeMetrics(samples, outcomes),
      costReport(outcomes, samples.length),
    );
    expect(verdict.status).toBe('n/a');
    expect(verdict.reasons.some((r) => r.includes('Tiếng Anh'))).toBe(true);
  });

  it('mẫu thật đủ số lượng nhưng chỉ số trượt → fail kèm lý do từng nhóm', () => {
    const samples = realSamples(30);
    const outcomes = new Map(
      samples.map((s) => [
        s.id,
        { ...(ok(s.id, []) as Extract<SampleOutcome, { ok: true }>), label: 'advice' },
      ]),
    );
    const verdict = gateVerdict(
      samples,
      computeMetrics(samples, outcomes),
      costReport(outcomes, samples.length),
    );
    expect(verdict.status).toBe('fail');
    expect(verdict.reasons.some((r) => r.includes('Độ chính xác phân loại'))).toBe(true);
  });

  it('mẫu thật đủ, mọi chỉ số đạt, chi phí dưới trần → pass; vượt trần → fail', () => {
    const samples = realSamples(30);
    const outcomes = outcomesOf(samples);
    const metrics = computeMetrics(samples, outcomes);
    expect(gateVerdict(samples, metrics, costReport(outcomes, samples.length)).status).toBe('pass');
    const expensive = new Map(
      samples.map((s) => [s.id, ok(s.id, [usage('draft', { costUsd: 1 })])]),
    );
    const verdict = gateVerdict(samples, metrics, costReport(expensive, samples.length));
    expect(verdict.status).toBe('fail');
    expect(verdict.reasons.join(' ')).toContain('USD/1.000 lượt');
  });
});

describe('EVAL-RUNNER hiển thị báo cáo', () => {
  it('bộ synthetic có cảnh báo ở đầu; có bảng chi phí tách bước; kết luận n/a; liệt kê lỗi chạy', () => {
    const samples = [sample('a', 'vi', 'synthetic'), sample('b', 'en', 'synthetic')];
    const outcomes = new Map<string, SampleOutcome>([
      ['a', ok('a', [usage('extract'), usage('draft')])],
      [
        'b',
        {
          ok: false,
          id: 'b',
          errorKind: 'invalid_output',
          detail: 'LLM_UNAVAILABLE: x',
          usage: [],
        },
      ],
    ]);
    const text = renderReport({
      title: 'Thử',
      config: { Backend: 'mock' },
      samples,
      metrics: computeMetrics(samples, outcomes),
      cost: costReport(outcomes, samples.length),
      outcomes,
    });
    expect(text).toContain('Bộ mẫu `synthetic`');
    expect(text).toContain('KHÔNG dùng để chọn model');
    expect(text).toContain('| extract |');
    expect(text).toContain('| rewrite |');
    expect(text).toContain('| draft |');
    expect(text).toContain('KHÔNG ÁP DỤNG');
    expect(text).toContain('invalid_output: 1');
    expect(text).toContain('Token suy luận ≈ 0');
  });

  it('mẫu thật, đạt: không có cảnh báo synthetic, kết luận ĐẠT', () => {
    const samples = LANG_GROUPS.flatMap((g) =>
      Array.from({ length: 30 }, (_, i) => sample(`${g}${i}`, g, 'real')),
    );
    const outcomes = new Map(
      samples.map((s) => [s.id, ok(s.id, [usage('draft', { costUsd: 0.0001 })])]),
    );
    const text = renderReport({
      title: 'Thật',
      config: {},
      samples,
      metrics: computeMetrics(samples, outcomes),
      cost: costReport(outcomes, samples.length),
      outcomes,
    });
    expect(text).not.toContain('Bộ mẫu `synthetic`');
    expect(text).toContain('ĐẠT');
  });
});
