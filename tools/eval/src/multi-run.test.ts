import { describe, expect, it } from 'vitest';
import type { EvalSample } from './dataset';
import { aggregate, type GroupMetrics, judge, type SampleChecks } from './metrics';
import { findFlakySamples, renderMultiRun, summarizeRuns, worstGroup } from './multi-run';

const checks = (over: Partial<SampleChecks> = {}): SampleChecks => ({
  label: true,
  action: true,
  lang: true,
  facts: null,
  claimSourced: true,
  priceWrong: false,
  forbiddenHit: false,
  addressWrong: false,
  variantsWrong: 0,
  extract: {},
  safety: null,
  failed: false,
  ...over,
});
const sample = (id: string, over: Partial<EvalSample> = {}) =>
  ({ id, group: 'vi', category: 'normal', ...over }) as EvalSample;

/** Một lượt: `actionOk[i]` = mẫu i chọn đúng hành động. */
const run = (actionOk: boolean[], extra: Partial<SampleChecks> = {}): GroupMetrics =>
  aggregate(
    actionOk.map((ok, i) => ({
      sample: sample(`s${i}`),
      checks: checks({ action: ok, ...extra }),
    })),
  );

describe('summarizeRuns — trung bình + min/max theo chỉ số', () => {
  it('3 lượt: action 9/10, 10/10, 8/10 → mean 0.9, min 0.8, max 1', () => {
    const r1 = run([...Array(9).fill(true), false]);
    const r2 = run(Array(10).fill(true));
    const r3 = run([...Array(8).fill(true), false, false]);
    const s = summarizeRuns([r1, r2, r3]);
    const action = s.rates.action;
    expect(action?.mean).toBeCloseTo(0.9);
    expect(action?.min).toBeCloseTo(0.8);
    expect(action?.max).toBe(1);
    expect(action?.perRun).toEqual([0.9, 1, 0.8]);
    expect(s.runs).toBe(3);
  });

  it('chỉ số không đo được ở mọi lượt (rate null) → mean/min/max = null, không tính là 0', () => {
    const s = summarizeRuns([run([true]), run([true])]);
    expect(s.rates.facts).toMatchObject({ mean: null, min: null, max: null });
  });

  it('đếm lỗi (sai giá…): lấy trung bình + min + max', () => {
    const s = summarizeRuns([
      run([true], { priceWrong: true }),
      run([true]),
      run([true], { priceWrong: true }),
    ]);
    expect(s.counts.priceWrong).toEqual({ mean: 2 / 3, min: 0, max: 1, perRun: [1, 0, 1] });
  });
});

describe('worstGroup — cổng chấm theo LƯỢT TỆ NHẤT', () => {
  it('mỗi tỉ lệ lấy lượt thấp nhất, mỗi bộ đếm lấy lượt cao nhất', () => {
    const good = run(Array(10).fill(true));
    const bad = run([...Array(8).fill(true), false, false], { priceWrong: true });
    const worst = worstGroup([good, bad]);
    expect(worst.action).toMatchObject({ passed: 8, total: 10 });
    expect(worst.priceWrong).toBe(10);
  });

  it('một lượt tốt + một lượt trượt ngưỡng → phán quyết trượt (không để lượt tốt che)', () => {
    const verdicts = judge(
      worstGroup([run(Array(10).fill(true)), run([...Array(8).fill(true), false, false])]),
    );
    expect(verdicts.find((v) => v.name.startsWith('Chọn đúng hành động'))?.pass).toBe(false);
  });

  it('rate null ở một lượt, có số ở lượt khác → lấy số có thật; tất cả null → vẫn null', () => {
    const a = run([true]);
    const b = { ...run([true]), facts: { passed: 1, total: 4, rate: 0.25 } };
    expect(worstGroup([a, b]).facts.rate).toBe(0.25);
    expect(worstGroup([a, a]).facts.rate).toBeNull();
  });
});

describe('findFlakySamples — mẫu cho kết quả khác nhau giữa các lượt', () => {
  it('liệt kê mẫu đổi hành động/kiểm tra giữa lượt; mẫu ổn định không có mặt', () => {
    const samples = [sample('a'), sample('b'), sample('c')];
    const perRun = [
      new Map([
        ['a', checks()],
        ['b', checks({ action: true })],
        ['c', checks({ priceWrong: true })],
      ]),
      new Map([
        ['a', checks()],
        ['b', checks({ action: false })],
        ['c', checks({ priceWrong: true })],
      ]),
      new Map([
        ['a', checks()],
        ['b', checks({ action: true })],
        ['c', checks({ priceWrong: true })],
      ]),
    ];
    const flaky = findFlakySamples(samples, perRun);
    expect(flaky.map((f) => f.id)).toEqual(['b']);
    expect(flaky[0]?.failedRuns).toBe(1);
    expect(flaky[0]?.totalRuns).toBe(3);
    expect(flaky[0]?.differing).toContain('action');
  });

  it('mẫu thiếu kết quả ở một lượt bị bỏ qua lượt đó; một lượt duy nhất → không có chập chờn', () => {
    expect(findFlakySamples([sample('a')], [new Map([['a', checks()]])])).toEqual([]);
  });
});

describe('renderMultiRun', () => {
  it('bảng mean/min/max + phán quyết theo lượt tệ nhất + mục mẫu chập chờn', () => {
    const groups = {
      vi: [run(Array(10).fill(true)), run([...Array(8).fill(true), false, false])],
    };
    const md = renderMultiRun({
      title: 'Thử',
      repeats: 2,
      groups,
      flaky: [{ id: 's9', failedRuns: 1, totalRuns: 2, differing: ['action'] }],
    });
    expect(md).toContain('2 lượt');
    expect(md).toMatch(/Chọn đúng hành động[^\n]*\|[^\n]*80\.0%[^\n]*100\.0%/);
    expect(md).toContain('Mẫu chập chờn');
    expect(md).toContain('s9');
    expect(md).toMatch(/lượt tệ nhất/i);
  });

  it('không có mẫu chập chờn → ghi rõ', () => {
    const md = renderMultiRun({ title: 'T', repeats: 3, groups: { vi: [run([true])] }, flaky: [] });
    expect(md).toMatch(/không có mẫu chập chờn/i);
  });
});
