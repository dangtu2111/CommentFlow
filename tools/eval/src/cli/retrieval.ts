// Nhóm R: đo TRUY HỒI trên đường production (docs/14 §4.3) — recall@5, MRR theo nhóm ngôn ngữ + báo cáo từng câu trượt (top-5 kèm điểm từng nhánh).
//   pnpm --filter @flow/eval run retrieval --dataset datasets/synthetic-v2-sswiftly-en.jsonl --shop datasets/shops/sswiftly.json \
//        --gold datasets/retrieval/sswiftly.jsonl --out out/retrieval/sswiftly
// Không gọi LLM (chỉ embedding bge-m3 qua dịch vụ ml + tìm kiếm trong DB `[EVAL]` của cf_dev) nên không tốn chi phí LiteLLM. Không in khóa/nội dung bí mật.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  createAbbreviationDict,
  DEFAULT_MIN_RELEVANCE,
  DEMO_ABBREVIATIONS,
  KB_MIN_COSINE,
  KB_MIN_RERANK,
  normalizeAndDetectLang,
  rrfRelevance,
  shouldRerank,
} from '@flow/ai';
import { searchKbChunksDetailed } from '@flow/db';
import { parseDataset } from '../dataset';
import { EVAL_WORKSPACE } from '../eval-workspace';
import { describeProduction, openProduction } from '../production/setup';
import {
  aggregateRetrieval,
  calibrateThreshold,
  firstHitRank,
  parseRetrievalGold,
  RETRIEVAL_THRESHOLDS,
  type RetrievalRow,
} from '../retrieval-metrics';
import {
  buildOriginMap,
  originOf,
  type QuestionDiagnostic,
  renderRetrievalReport,
  type TopHit,
} from '../retrieval-report';
import { shopFixtureSchema } from '../shop';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values } = parseArgs({
  options: {
    dataset: { type: 'string' },
    shop: { type: 'string' },
    gold: { type: 'string' },
    out: { type: 'string', default: resolve(ROOT, 'out/retrieval') },
    limit: { type: 'string' },
    // Câu truy vấn dùng để tìm: `normalized` (như pipeline: đã chuẩn hóa/mở rộng viết tắt), `raw` (câu gốc), `max` (cả hai, lấy điểm cao hơn mỗi đoạn).
    'query-mode': { type: 'string', default: 'normalized' },
  },
});
if (!values.dataset || !values.shop || !values.gold) {
  console.error('Cần --dataset, --shop và --gold.');
  process.exit(2);
}

const samples = parseDataset(readFileSync(values.dataset, 'utf8'));
const gold = parseRetrievalGold(readFileSync(values.gold, 'utf8'));
const shop = shopFixtureSchema.parse(JSON.parse(readFileSync(values.shop, 'utf8')));
const origins = buildOriginMap(shop);
const dict = createAbbreviationDict(DEMO_ABBREVIATIONS);
const k = RETRIEVAL_THRESHOLDS.k;

let handle: Awaited<ReturnType<typeof openProduction>>;
try {
  handle = await openProduction(shop, process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Cấu hình DB không hợp lệ.');
  process.exit(2);
}
console.log(describeProduction(handle.info));

const workspaceId = EVAL_WORKSPACE.id;
const versionId = handle.info.kbVersion.id;
const search = async (text: string, lang: 'vi' | 'en', vector: readonly number[]) =>
  handle.db.withJob(workspaceId, (tx) =>
    searchKbChunksDetailed(tx, {
      workspaceId,
      versionId,
      lang,
      queryText: text,
      queryVector: vector,
      embeddingModel: handle.embedder.model,
    }),
  );

const TOP_RERANK = 10;
const textOf = (hit: { contextHeader: string | null; content: string }) =>
  hit.contextHeader ? `${hit.contextHeader}\n${hit.content}` : hit.content;

type Fetched = {
  hits: Awaited<ReturnType<typeof search>>;
  origins: string[];
  /** Điểm rerank 0..1 của TOP_RERANK đoạn đầu (theo thứ tự `hits`); `null` = không có reranker. */
  rerank: number[] | null;
  lang: 'vi' | 'en';
  vector: number[];
  /** Câu thực sự đưa vào tìm kiếm (theo `--query-mode`). */
  text: string;
};

const queryMode = values['query-mode'] as 'normalized' | 'raw' | 'max';

async function fetchFor(original: string): Promise<Fetched> {
  // Cùng cách pipeline nhận ngôn ngữ câu hỏi; 'other' → 'vi' như `knowledge.searchKb`.
  const norm = normalizeAndDetectLang({ text: original, dict });
  const lang = norm.lang === 'en' ? 'en' : 'vi';
  const text = queryMode === 'raw' ? original : norm.normalized;
  const vector = (await handle.embedder.embed([text]))[0] as number[];
  let hits = await search(text, lang, vector);
  if (queryMode === 'max' && original !== norm.normalized) {
    // Thêm tìm kiếm bằng câu GỐC; mỗi đoạn lấy cosine và điểm RRF cao hơn giữa hai lần, rồi xếp lại theo RRF.
    const rawVector = (await handle.embedder.embed([original]))[0] as number[];
    const alt = await search(original, lang, rawVector);
    const byId = new Map(hits.map((h) => [h.id, h]));
    for (const h of alt) {
      const have = byId.get(h.id);
      if (!have) byId.set(h.id, h);
      else {
        byId.set(h.id, {
          ...have,
          score: Math.max(have.score, h.score),
          cosine: Math.max(have.cosine ?? 0, h.cosine ?? 0),
        });
      }
    }
    hits = [...byId.values()].sort((a, b) => b.score - a.score);
  }
  // Cùng chính sách như production: bỏ rerank với tiếng Việt không dấu (đo: làm xấu đi).
  const rerank =
    handle.reranker && shouldRerank(text, lang)
      ? await handle.reranker.rerank(original, hits.slice(0, TOP_RERANK).map(textOf))
      : null;
  return {
    hits,
    origins: hits.map((hit) => originOf(hit.chunkKey, origins)),
    rerank,
    lang,
    vector,
    text,
  };
}

/** Thứ tự SAU rerank (chỉ TOP_RERANK đoạn đầu, như production): chỉ số vào `hits` theo điểm rerank giảm dần. */
const rerankOrder = (f: Fetched): number[] =>
  (f.rerank ?? [])
    .map((score, i) => [score, i] as const)
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i);

const rows: RetrievalRow[] = [];
const rowsRerank: RetrievalRow[] = [];
const positiveCos: Record<string, number> = {};
const negativeCos: Record<string, number> = {};
const positiveRerank: Record<string, number> = {};
const negativeRerank: Record<string, number> = {};
const diagnostics: QuestionDiagnostic[] = [];
const wanted = samples.filter((sample) => gold.has(sample.id));
const picked = values.limit ? wanted.slice(0, Number(values.limit)) : wanted;
for (const sample of picked) {
  const goldSet = gold.get(sample.id) as Set<string>;
  const f = await fetchFor(sample.text);
  const rank = firstHitRank(f.origins, goldSet);
  rows.push({ id: sample.id, group: sample.group, rank });
  // Điểm tuyệt đối của đoạn đúng tốt nhất; không có trong kết quả = 0 (phải rớt dưới mọi ngưỡng).
  positiveCos[sample.id] = Math.max(
    0,
    ...f.hits.flatMap((hit, i) =>
      goldSet.has(f.origins[i] as string) && hit.cosine !== null ? [hit.cosine] : [],
    ),
  );
  const order = rerankOrder(f);
  const finalOrder = f.rerank ? order : f.hits.map((_, i) => i);
  let finalRank = rank;
  if (f.rerank) {
    positiveRerank[sample.id] = Math.max(
      0,
      ...order.flatMap((i) => (goldSet.has(f.origins[i] as string) ? [f.rerank?.[i] ?? 0] : [])),
    );
    finalRank = firstHitRank(
      order.map((i) => f.origins[i] as string),
      goldSet,
    );
    rowsRerank.push({ id: sample.id, group: sample.group, rank: finalRank });
  }
  if (finalRank !== null && finalRank <= k) continue;
  const other = await search(f.text, f.lang === 'en' ? 'vi' : 'en', f.vector);
  const top: TopHit[] = finalOrder.slice(0, k).map((i) => {
    const hit = f.hits[i] as (typeof f.hits)[number];
    const score = f.rerank ? (f.rerank[i] as number) : rrfRelevance(hit.score);
    return {
      origin: f.origins[i] as string,
      chunkKey: hit.chunkKey,
      rrf: hit.score,
      relevance: score,
      vector: hit.branches.vector,
      text: hit.branches.text,
      trigram: hit.branches.trigram,
      isGold: goldSet.has(f.origins[i] as string),
    };
  });
  diagnostics.push({
    id: sample.id,
    group: sample.group,
    text: sample.text,
    gold: [...goldSet],
    rank: finalRank,
    top,
    relevanceFloor: f.rerank ? KB_MIN_RERANK : DEFAULT_MIN_RELEVANCE,
    goldOutsideTopWithOtherLang:
      firstHitRank(
        other.map((hit) => originOf(hit.chunkKey, origins)),
        goldSet,
      ) !== null,
  });
}

// Mẫu ÂM: câu mong đợi "chuyển hướng" vì shop KHÔNG có nguồn (không gán đoạn đúng) — điểm cao nhất của kết quả phải rớt dưới ngưỡng.
for (const sample of samples) {
  if (gold.has(sample.id) || sample.expected.action !== 'redirect' || sample.category !== 'normal')
    continue;
  const f = await fetchFor(sample.text);
  negativeCos[sample.id] = Math.max(0, ...f.hits.slice(0, k).map((hit) => hit.cosine ?? 0));
  if (f.rerank) negativeRerank[sample.id] = Math.max(0, ...f.rerank);
}
const calibrations = [
  {
    ...calibrateThreshold(Object.values(positiveCos), Object.values(negativeCos)),
    scoreKind: `cosine ${handle.info.embeddingModel}`,
    positiveSamples: positiveCos,
    negativeSamples: negativeCos,
  },
  ...(handle.reranker
    ? [
        {
          ...calibrateThreshold(Object.values(positiveRerank), Object.values(negativeRerank)),
          scoreKind: `rerank ${handle.reranker.model}`,
          positiveSamples: positiveRerank,
          negativeSamples: negativeRerank,
        },
      ]
    : []),
];
const metrics = aggregateRetrieval(rows, k);
const report = renderRetrievalReport({
  title: `Truy hồi trên đường production — ${shop.id}`,
  config: {
    'Bộ mẫu': `${values.dataset} (${picked.length} câu có gán đoạn đúng)`,
    'Nguồn kiến thức': `PRODUCTION — [EVAL] kb_version ${handle.info.kbVersion.number}`,
    Embedder: `${handle.info.embeddingModel} (bge-m3 thật, đoạn và truy vấn cùng model)`,
    Rerank: handle.reranker
      ? `${handle.reranker.model} (thật qua ml /rerank, top-${TOP_RERANK} theo RRF)`
      : 'tắt (ML_RERANK_ENABLED chưa bật) — quyết định liên quan bằng cosine',
    'Câu truy vấn': queryMode,
    'Cách tìm':
      'tìm lai: vector + toàn văn + trigram (RRF k=60), không lọc lang (ưu tiên nhẹ cùng ngôn ngữ), không lọc sản phẩm',
    'Ngưỡng liên quan hiện dùng': handle.reranker
      ? `rerank ${KB_MIN_RERANK}`
      : `cosine ${KB_MIN_COSINE}`,
    'Chi phí LiteLLM': '0 (không gọi LLM; chỉ embedding + rerank)',
  },
  metrics,
  ...(handle.reranker
    ? {
        extraMetrics: [
          {
            label: 'Chỉ số SAU rerank (xếp lại top-10)',
            metrics: aggregateRetrieval(rowsRerank, k),
          },
        ],
      }
    : {}),
  failures: diagnostics,
  calibrations,
});
mkdirSync(values.out as string, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = resolve(values.out as string, `retrieval-${shop.id}-${stamp}.md`);
writeFileSync(file, report);
console.log(report);
console.log(`\nĐã ghi: ${file}`);
await handle.close();
