import type { ReadinessRequiredItem, ReadinessResult, ReadinessTopic } from '@flow/ai';

/**
 * Mô hình hiển thị của trang "Độ sẵn sàng AI & Bộ câu kiểm thử" (Readiness & Test Lab). THUẦN: chỉ gom lại số liệu đã do
 * `computeReadiness` tính (không tính điểm mới, không bịa số).
 */

export type ReadinessBand = 'unsafe' | 'basic' | 'ready';

/** Mốc dải điểm: ≤ 50 chưa an toàn, 51 → (ngưỡng − 1) cơ bản, ≥ ngưỡng (và đủ mục bắt buộc) sẵn sàng tự động. */
export function bandOf(
  result: Pick<ReadinessResult, 'score' | 'ready' | 'minPercent'>,
): ReadinessBand {
  if (result.ready) return 'ready';
  if (result.score <= 50) return 'unsafe';
  return 'basic';
}

/** Điểm còn thiếu để chạm ngưỡng tự động (0 khi đã đủ). */
export function pointsToReady(result: Pick<ReadinessResult, 'score' | 'minPercent'>): number {
  return Math.max(0, result.minPercent - result.score);
}

export const PILLARS = ['policies', 'products', 'shop', 'faq'] as const;
export type Pillar = (typeof PILLARS)[number];

/** Chủ đề câu mẫu thuộc trụ cột nào (đủ 12 chủ đề của `ReadinessTopic`). */
export const PILLAR_OF_TOPIC: Record<ReadinessTopic, Pillar> = {
  shipping: 'policies',
  return: 'policies',
  warranty: 'policies',
  payment: 'policies',
  price: 'products',
  size: 'products',
  color: 'products',
  stock: 'products',
  hours: 'shop',
  contact: 'shop',
  address: 'shop',
  promo: 'faq',
};

export type PillarView = {
  pillar: Pillar;
  answerable: number;
  total: number;
  /** 0–100, làm tròn. */
  percent: number;
  /** Chủ đề (không trùng) còn thiếu nguồn. */
  missingTopics: ReadinessTopic[];
};

export function pillarsOf(result: Pick<ReadinessResult, 'samples'>): PillarView[] {
  return PILLARS.map((pillar) => {
    const inPillar = result.samples.filter((s) => PILLAR_OF_TOPIC[s.topic] === pillar);
    const answerable = inPillar.filter((s) => s.answerable).length;
    const total = inPillar.length;
    return {
      pillar,
      answerable,
      total,
      percent: total === 0 ? 0 : Math.round((100 * answerable) / total),
      missingTopics: [...new Set(inPillar.filter((s) => !s.answerable).map((s) => s.topic))],
    };
  });
}

/** Trang nơi bổ sung dữ liệu của từng trụ cột. */
export const PILLAR_HREF: Record<Pillar, string> = {
  policies: '/app/kb/policies',
  products: '/app/kb/catalog',
  shop: '/app/kb/shop',
  faq: '/app/kb/faq',
};

const REQUIRED_PILLAR: Record<ReadinessRequiredItem, Pillar> = {
  product_price: 'products',
  shipping_policy: 'policies',
  return_policy: 'policies',
  contact_hours: 'shop',
};

export type CoachStep =
  | { kind: 'required'; item: ReadinessRequiredItem; href: string }
  | { kind: 'topic'; topic: ReadinessTopic; href: string };

/** Gợi ý việc nên làm: mục bắt buộc còn thiếu trước, rồi chủ đề còn thiếu (không trùng); tối đa `limit` bước. */
export function coachSteps(
  result: Pick<ReadinessResult, 'missingRequired' | 'missingTopics'>,
  limit = 4,
): CoachStep[] {
  const steps: CoachStep[] = result.missingRequired.map((item) => ({
    kind: 'required' as const,
    item,
    href: PILLAR_HREF[REQUIRED_PILLAR[item]],
  }));
  for (const topic of result.missingTopics) {
    steps.push({ kind: 'topic', topic, href: PILLAR_HREF[PILLAR_OF_TOPIC[topic]] });
  }
  return steps.slice(0, limit);
}

/** Trạng thái lần chạy cuối của một câu; `null` = chưa chạy lần nào. */
export type LabStatus = 'pass' | 'fail' | 'error' | null;
export type LabFilter = 'all' | 'pass' | 'fail' | 'error' | 'untested';

export const LAB_FILTERS: readonly LabFilter[] = ['all', 'pass', 'fail', 'error', 'untested'];

const matchesFilter = (status: LabStatus, filter: LabFilter): boolean =>
  filter === 'all' || (filter === 'untested' ? status === null : status === filter);

/** Lọc câu theo tab và từ khóa (không phân biệt hoa thường). */
export function filterLabResults<T extends { lastStatus: LabStatus; question: string }>(
  rows: readonly T[],
  filter: LabFilter,
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      matchesFilter(r.lastStatus, filter) &&
      (needle === '' || r.question.toLowerCase().includes(needle)),
  );
}

/** Số lượng theo tab để hiện trên nhãn. */
export function labCounts(
  rows: ReadonlyArray<{ lastStatus: LabStatus }>,
): Record<LabFilter, number> {
  const count = (filter: LabFilter) =>
    rows.filter((r) => matchesFilter(r.lastStatus, filter)).length;
  return {
    all: rows.length,
    pass: count('pass'),
    fail: count('fail'),
    error: count('error'),
    untested: count('untested'),
  };
}

/** Tỷ lệ chính xác (%) trên các câu ĐÃ chạy; chưa câu nào chạy → `null` (không hiện số bịa). */
export function labAccuracy(rows: ReadonlyArray<{ lastStatus: LabStatus }>): number | null {
  const run = rows.filter((r) => r.lastStatus !== null);
  if (run.length === 0) return null;
  return Math.round((100 * run.filter((r) => r.lastStatus === 'pass').length) / run.length);
}
