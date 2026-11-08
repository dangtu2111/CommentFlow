import { z } from 'zod';
import { LANG_GROUPS, type LangGroup } from './dataset';

/**
 * Bộ đo TRUY HỒI (docs/14 §4.3, Nhóm R): với mỗi câu có gán "đoạn đúng", đo đoạn đúng đầu tiên nằm ở hạng mấy trong kết quả tìm của đường production.
 * recall@k = tỉ lệ câu có đoạn đúng trong top-k; MRR = trung bình 1/hạng (không có = 0). Hàm thuần, không I/O.
 */
export const RETRIEVAL_THRESHOLDS = { recallAtK: 0.9, mrr: 0.7, k: 5 } as const;

/** Hạng (từ 1) của kết quả đúng đầu tiên; `null` nếu không có. `retrievedOrigins` là mã mục kiến thức theo thứ tự trả về. */
export function firstHitRank(
  retrievedOrigins: readonly string[],
  gold: ReadonlySet<string>,
): number | null {
  const index = retrievedOrigins.findIndex((origin) => gold.has(origin));
  return index === -1 ? null : index + 1;
}

export type RetrievalRow = { id: string; group: LangGroup; rank: number | null };
export type RetrievalGroupMetrics = {
  samples: number;
  recallAtK: number | null;
  mrr: number | null;
};

const summarize = (rows: readonly RetrievalRow[], k: number): RetrievalGroupMetrics => {
  if (rows.length === 0) return { samples: 0, recallAtK: null, mrr: null };
  const hits = rows.filter((row) => row.rank !== null && row.rank <= k).length;
  const mrr =
    rows.reduce((sum, row) => sum + (row.rank === null ? 0 : 1 / row.rank), 0) / rows.length;
  return { samples: rows.length, recallAtK: hits / rows.length, mrr };
};

export function aggregateRetrieval(
  rows: readonly RetrievalRow[],
  k: number,
): Record<string, RetrievalGroupMetrics> & { all: RetrievalGroupMetrics } {
  const result: Record<string, RetrievalGroupMetrics> = { all: summarize(rows, k) };
  for (const group of LANG_GROUPS) {
    const own = rows.filter((row) => row.group === group);
    if (own.length > 0) result[group] = summarize(own, k);
  }
  return result as Record<string, RetrievalGroupMetrics> & { all: RetrievalGroupMetrics };
}

export type RetrievalVerdict = {
  name: string;
  value: string;
  threshold: string;
  pass: boolean | null;
};

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

export function judgeRetrieval(group: RetrievalGroupMetrics): RetrievalVerdict[] {
  const check = (
    name: string,
    value: number | null,
    min: number,
    show: (v: number | null) => string,
  ) => ({
    name,
    value: show(value),
    threshold: `≥ ${show(min)}`,
    pass: value === null ? null : value >= min,
  });
  return [
    check(`recall@${RETRIEVAL_THRESHOLDS.k}`, group.recallAtK, RETRIEVAL_THRESHOLDS.recallAtK, pct),
    check('MRR', group.mrr, RETRIEVAL_THRESHOLDS.mrr, (v) => (v === null ? 'n/a' : v.toFixed(3))),
  ];
}

const goldLine = z.object({ id: z.string().min(1), gold: z.array(z.string().min(1)).min(1) });

/** Tệp JSONL gán đoạn đúng: `{"id":"<mã mẫu>","gold":["<mã mục kiến thức>", …]}` (mã mục = `texts[].id`/`products[].id` của shop file). */
export function parseRetrievalGold(jsonl: string): Map<string, Set<string>> {
  const gold = new Map<string, Set<string>>();
  jsonl.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error(`Gán đoạn đúng: dòng ${index + 1} không phải JSON.`);
    }
    const parsed = goldLine.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Gán đoạn đúng: dòng ${index + 1} thiếu id hoặc gold (cần ít nhất một mã mục).`,
      );
    }
    if (gold.has(parsed.data.id)) {
      throw new Error(`Gán đoạn đúng: mã mẫu trùng "${parsed.data.id}" (dòng ${index + 1}).`);
    }
    gold.set(parsed.data.id, new Set(parsed.data.gold));
  });
  return gold;
}
