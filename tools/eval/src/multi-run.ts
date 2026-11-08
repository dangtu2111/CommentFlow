import type { EvalSample } from './dataset';
import { type GroupMetrics, judge, type Rate, type SampleChecks } from './metrics';

/**
 * Đo NHIỀU LƯỢT (EVAL-RELIABILITY): một lượt LLM dao động nên so trước/sau phải chạy ≥ 3 lượt mỗi bên, báo trung bình + min/max, chấm cổng theo
 * LƯỢT TỆ NHẤT (không để một lượt may mắn che lượt trượt) và liệt kê riêng mẫu chập chờn. Hàm thuần, không I/O.
 */
export const RATE_KEYS = [
  'label',
  'lang',
  'facts',
  'claimSourced',
  'action',
  'clarifyAction',
  'safety',
] as const;
export type RateKey = (typeof RATE_KEYS)[number];
export const EXTRACT_KEYS = ['product_mentions', 'size', 'color', 'qty'] as const;
export const COUNT_KEYS = ['priceWrong', 'addressWrong', 'variantsWrong', 'failedRuns'] as const;
export type CountKey = (typeof COUNT_KEYS)[number];

export type Spread = {
  mean: number | null;
  min: number | null;
  max: number | null;
  /** Giá trị từng lượt theo thứ tự chạy (`null` = lượt đó không đo được). */
  perRun: (number | null)[];
};

export type RunsSummary = {
  runs: number;
  rates: Record<string, Spread>;
  counts: Record<CountKey, { mean: number; min: number; max: number; perRun: number[] }>;
};

function spreadOf(values: (number | null)[]): Spread {
  const real = values.filter((v): v is number => v !== null);
  if (real.length === 0) return { mean: null, min: null, max: null, perRun: values };
  return {
    mean: real.reduce((a, b) => a + b, 0) / real.length,
    min: Math.min(...real),
    max: Math.max(...real),
    perRun: values,
  };
}

const rateOf = (group: GroupMetrics, key: string): Rate =>
  key.startsWith('extract.')
    ? group.extract[key.slice(8) as (typeof EXTRACT_KEYS)[number]]
    : (group[key as RateKey] as Rate);

/** Trung bình + min/max của từng tỉ lệ và từng bộ đếm qua các lượt của MỘT nhóm. */
export function summarizeRuns(runs: readonly GroupMetrics[]): RunsSummary {
  const keys = [...RATE_KEYS, ...EXTRACT_KEYS.map((k) => `extract.${k}`)];
  const rates = Object.fromEntries(
    keys.map((key) => [key, spreadOf(runs.map((run) => rateOf(run, key).rate))]),
  );
  const counts = Object.fromEntries(
    COUNT_KEYS.map((key) => {
      const perRun = runs.map((run) => run[key]);
      return [
        key,
        {
          mean: perRun.reduce((a, b) => a + b, 0) / Math.max(1, perRun.length),
          min: Math.min(...perRun),
          max: Math.max(...perRun),
          perRun,
        },
      ];
    }),
  ) as RunsSummary['counts'];
  return { runs: runs.length, rates, counts };
}

/** Lượt TỆ NHẤT của mỗi tỉ lệ (rate thấp nhất; `null` chỉ khi mọi lượt đều không đo được) và bộ đếm CAO nhất — đưa vào `judge`. */
export function worstGroup(runs: readonly GroupMetrics[]): GroupMetrics {
  const worstRate = (pick: (g: GroupMetrics) => Rate): Rate => {
    const measured = runs.map(pick).filter((r) => r.rate !== null);
    if (measured.length === 0) return pick(runs[0] as GroupMetrics);
    return measured.reduce((worst, r) => ((r.rate as number) < (worst.rate as number) ? r : worst));
  };
  const maxOf = (pick: (g: GroupMetrics) => number) => Math.max(...runs.map(pick));
  const first = runs[0] as GroupMetrics;
  return {
    samples: first.samples,
    failedRuns: maxOf((g) => g.failedRuns),
    label: worstRate((g) => g.label),
    lang: worstRate((g) => g.lang),
    facts: worstRate((g) => g.facts),
    claimSourced: worstRate((g) => g.claimSourced),
    action: worstRate((g) => g.action),
    clarifyAction: worstRate((g) => g.clarifyAction),
    safety: worstRate((g) => g.safety),
    extract: {
      product_mentions: worstRate((g) => g.extract.product_mentions),
      size: worstRate((g) => g.extract.size),
      color: worstRate((g) => g.extract.color),
      qty: worstRate((g) => g.extract.qty),
    },
    priceWrong: maxOf((g) => g.priceWrong),
    addressWrong: maxOf((g) => g.addressWrong),
    variantsWrong: maxOf((g) => g.variantsWrong),
  };
}

export type FlakySample = {
  id: string;
  /** Số lượt mà mẫu này có ít nhất một kiểm tra trượt. */
  failedRuns: number;
  totalRuns: number;
  /** Tên các kiểm tra có kết quả KHÁC nhau giữa các lượt. */
  differing: string[];
};

const FLAKY_FIELDS = [
  'label',
  'action',
  'lang',
  'facts',
  'claimSourced',
  'priceWrong',
  'forbiddenHit',
  'addressWrong',
  'safety',
  'failed',
] as const satisfies readonly (keyof SampleChecks)[];

/** Mẫu mà kết quả kiểm tra thay đổi giữa các lượt (cùng đầu vào, khác kết quả) — phải xem riêng, không tính vào số liệu "cải thiện". */
export function findFlakySamples(
  samples: readonly EvalSample[],
  perRun: readonly ReadonlyMap<string, SampleChecks>[],
): FlakySample[] {
  const flaky: FlakySample[] = [];
  for (const sample of samples) {
    const seen = perRun.flatMap((run) => {
      const c = run.get(sample.id);
      return c ? [c] : [];
    });
    if (seen.length < 2) continue;
    const differing = FLAKY_FIELDS.filter((field) => new Set(seen.map((c) => c[field])).size > 1);
    if (differing.length === 0) continue;
    const failedRuns = seen.filter(
      (c) =>
        c.failed ||
        !c.action ||
        !c.label ||
        c.priceWrong ||
        c.forbiddenHit ||
        c.addressWrong ||
        c.lang === false ||
        c.facts === false ||
        c.claimSourced === false ||
        c.safety === false,
    ).length;
    flaky.push({ id: sample.id, failedRuns, totalRuns: seen.length, differing: [...differing] });
  }
  return flaky;
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

const LABELS: Record<string, string> = {
  label: 'Phân loại',
  lang: 'Đúng ngôn ngữ',
  facts: 'Có sự kiện bắt buộc',
  claimSourced: 'Ý fact có nguồn',
  action: 'Chọn đúng hành động',
  clarifyAction: 'Đúng hành động (nhóm hỏi lại)',
  safety: 'Bộ an toàn',
  'extract.product_mentions': 'Tách: sản phẩm',
  'extract.size': 'Tách: size',
  'extract.color': 'Tách: màu',
  'extract.qty': 'Tách: số lượng',
};

export type MultiRunReportInput = {
  title: string;
  repeats: number;
  /** Các lượt của từng nhóm (khóa nhóm → số liệu mỗi lượt), vd `{ vi: [...], all: [...] }`. */
  groups: Record<string, readonly GroupMetrics[]>;
  flaky: readonly FlakySample[];
};

/** Báo cáo markdown: bảng trung bình/min/max mỗi nhóm + phán quyết theo LƯỢT TỆ NHẤT + mục mẫu chập chờn. */
export function renderMultiRun(input: MultiRunReportInput): string {
  const lines = [`## ${input.title} — ${input.repeats} lượt`, ''];
  lines.push(
    '> Cổng được chấm theo **lượt tệ nhất** của từng chỉ số (không phải trung bình). Số trung bình/min/max chỉ để xem độ dao động.',
    '',
  );
  for (const [name, runs] of Object.entries(input.groups)) {
    if (runs.length === 0) continue;
    const summary = summarizeRuns(runs);
    lines.push(
      `### Nhóm ${name}`,
      '',
      '| Chỉ số | Trung bình | Min | Max | Từng lượt |',
      '|---|---|---|---|---|',
    );
    for (const [key, spread] of Object.entries(summary.rates)) {
      if (spread.mean === null) continue;
      lines.push(
        `| ${LABELS[key] ?? key} | ${pct(spread.mean)} | ${pct(spread.min)} | ${pct(spread.max)} | ${spread.perRun.map(pct).join(' · ')} |`,
      );
    }
    for (const [key, c] of Object.entries(summary.counts)) {
      lines.push(
        `| ${key} (đếm) | ${c.mean.toFixed(2)} | ${c.min} | ${c.max} | ${c.perRun.join(' · ')} |`,
      );
    }
    lines.push('', '**Phán quyết theo lượt tệ nhất:**', '');
    for (const v of judge(worstGroup(runs))) {
      lines.push(
        `- ${v.pass === null ? '➖' : v.pass ? '✅' : '❌'} ${v.name}: ${v.value} (ngưỡng ${v.threshold})`,
      );
    }
    lines.push('');
  }
  lines.push('### Mẫu chập chờn', '');
  if (input.flaky.length === 0) {
    lines.push('Không có mẫu chập chờn: mọi mẫu cho cùng kết quả ở mọi lượt.', '');
  } else {
    lines.push(
      'Cùng đầu vào nhưng kết quả khác nhau giữa các lượt — KHÔNG tính là cải thiện/hồi quy của thay đổi đang đo:',
      '',
      '| Mẫu | Lượt trượt | Kiểm tra dao động |',
      '|---|---|---|',
    );
    for (const f of input.flaky) {
      lines.push(`| ${f.id} | ${f.failedRuns}/${f.totalRuns} | ${f.differing.join(', ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
