import type { LangGroup } from './dataset';
import { stableId } from './production/seed';
import {
  judgeRetrieval,
  RETRIEVAL_THRESHOLDS,
  type RetrievalGroupMetrics,
} from './retrieval-metrics';

/**
 * Báo cáo chẩn đoán truy hồi (Nhóm R): từng câu trượt kèm top-5, hạng + điểm từng nhánh, ngưỡng liên quan và LÝ DO đoạn đúng không vào/bị loại.
 * Hàm thuần; phần chạm DB nằm ở `cli/retrieval.ts`.
 */
type ShopLike = {
  id: string;
  texts: ReadonlyArray<{ id: string; kind: 'policy' | 'faq' }>;
  products: ReadonlyArray<{ id: string }>;
};

/** UUID ổn định (dùng khi nạp [EVAL]) → mã gốc trong shop file, để đổi `chunk_key` về mục kiến thức. */
export function buildOriginMap(shop: ShopLike): Map<string, string> {
  const map = new Map<string, string>();
  for (const text of shop.texts) map.set(stableId(shop.id, text.kind, text.id), text.id);
  for (const product of shop.products) {
    map.set(stableId(shop.id, 'product', product.id), product.id);
  }
  return map;
}

/** `policy:<uuid>:<mục>#<n>` / `faq:<uuid>#<n>` / `product:<uuid>#<n>` → mã gốc; khóa khác → phần trước `#`/mục. */
export function originOf(chunkKey: string, origins: ReadonlyMap<string, string>): string {
  const body = chunkKey.split('#')[0] ?? chunkKey;
  const [kind, id] = body.split(':');
  if ((kind === 'policy' || kind === 'faq' || kind === 'product') && id) {
    const found = origins.get(id);
    if (found) return found;
  }
  return `${kind ?? body}${id ? `:${id}` : ''}`;
}

export type TopHit = {
  origin: string;
  chunkKey: string;
  rrf: number;
  /** Điểm liên quan 0..1 (rrf / trần RRF) đem so với ngưỡng. */
  relevance: number;
  vector: { rank: number; distance: number } | null;
  text: { rank: number; tsRank: number } | null;
  trigram: { rank: number; wordSimilarity: number } | null;
  isGold: boolean;
};

export type QuestionDiagnostic = {
  id: string;
  group: LangGroup;
  text: string;
  gold: readonly string[];
  /** Hạng đoạn đúng đầu tiên trong KẾT QUẢ ĐẦY ĐỦ (không chỉ top-5); `null` = không xuất hiện. */
  rank: number | null;
  top: readonly TopHit[];
  relevanceFloor: number;
  /** Đoạn đúng CÓ xuất hiện khi bỏ lọc `lang` (tức là đã bị lọc theo ngôn ngữ). */
  goldOutsideTopWithOtherLang: boolean;
};

export function explainMiss(d: QuestionDiagnostic): string {
  if (d.rank === null) {
    return d.goldOutsideTopWithOtherLang
      ? 'Đoạn đúng có trong DB nhưng bị lọc theo `lang` của đoạn (khác ngôn ngữ câu hỏi).'
      : 'Không nhánh nào (vector, toàn văn, trigram) đưa đoạn đúng vào kết quả.';
  }
  if (d.rank > RETRIEVAL_THRESHOLDS.k) {
    return `Đoạn đúng xuất hiện nhưng xếp hạng ${d.rank} (> top-${RETRIEVAL_THRESHOLDS.k}): bị đoạn khác lấn.`;
  }
  const gold = d.top.find((h) => h.isGold);
  if (gold && gold.relevance < d.relevanceFloor) {
    return `Đoạn đúng ở hạng ${d.rank} nhưng điểm liên quan ${gold.relevance.toFixed(2)} < ngưỡng ${d.relevanceFloor}: bị loại bởi ngưỡng.`;
  }
  return `Đoạn đúng ở hạng ${d.rank}.`;
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

const branchText = (h: TopHit) =>
  [
    h.vector ? `vector #${h.vector.rank} (d=${h.vector.distance.toFixed(3)})` : null,
    h.text ? `toàn văn #${h.text.rank} (ts=${h.text.tsRank.toFixed(3)})` : null,
    h.trigram ? `trigram #${h.trigram.rank} (ws=${h.trigram.wordSimilarity.toFixed(2)})` : null,
  ]
    .filter((x): x is string => x !== null)
    .join(' · ') || '—';

export function renderRetrievalReport(input: {
  title: string;
  config: Record<string, string>;
  metrics: Record<string, RetrievalGroupMetrics>;
  failures: readonly QuestionDiagnostic[];
}): string {
  const k = RETRIEVAL_THRESHOLDS.k;
  const lines = [`# ${input.title}`, ''];
  for (const [key, value] of Object.entries(input.config)) lines.push(`- ${key}: ${value}`);
  lines.push('', `## Chỉ số theo nhóm (recall@${k}, MRR)`, '');
  lines.push(`| Nhóm | Số câu | recall@${k} | MRR |`, '|---|---|---|---|');
  for (const [group, m] of Object.entries(input.metrics)) {
    lines.push(
      `| ${group} | ${m.samples} | ${pct(m.recallAtK)} | ${m.mrr === null ? 'n/a' : m.mrr.toFixed(3)} |`,
    );
  }
  lines.push('', '### Phán quyết (mục tiêu recall@5 ≥ 0,9 và MRR ≥ 0,7)', '');
  for (const [group, m] of Object.entries(input.metrics)) {
    for (const v of judgeRetrieval(m)) {
      lines.push(
        `- ${v.pass === null ? '➖' : v.pass ? '✅' : '❌'} ${group} — ${v.name}: ${v.value} (ngưỡng ${v.threshold})`,
      );
    }
  }
  lines.push('', '## Câu trượt (đoạn đúng không có trong top-5)', '');
  if (input.failures.length === 0) {
    lines.push('Không có câu trượt.', '');
    return lines.join('\n');
  }
  for (const d of input.failures) {
    lines.push(`### ${d.id} (${d.group}) — "${d.text}"`, '');
    lines.push(`- Đoạn đúng: ${d.gold.join(', ')}`);
    lines.push(`- Lý do: ${explainMiss(d)}`);
    lines.push(`- Ngưỡng liên quan: ${d.relevanceFloor}`, '');
    lines.push('| # | Mục | RRF | Liên quan | Nhánh |', '|---|---|---|---|---|');
    d.top.forEach((h, i) => {
      lines.push(
        `| ${i + 1}${h.isGold ? ' ✅' : ''} | ${h.origin} | ${h.rrf.toFixed(4)} | ${h.relevance.toFixed(2)}${h.relevance < d.relevanceFloor ? ' (< ngưỡng)' : ''} | ${branchText(h)} |`,
      );
    });
    lines.push('');
  }
  return lines.join('\n');
}
