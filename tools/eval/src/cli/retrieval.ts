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
  normalizeAndDetectLang,
  rrfRelevance,
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

const rows: RetrievalRow[] = [];
const positiveCos: Record<string, number> = {};
const negativeCos: Record<string, number> = {};
const diagnostics: QuestionDiagnostic[] = [];
const wanted = samples.filter((sample) => gold.has(sample.id));
const picked = values.limit ? wanted.slice(0, Number(values.limit)) : wanted;
for (const sample of picked) {
  const goldSet = gold.get(sample.id) as Set<string>;
  // Cùng cách pipeline nhận ngôn ngữ câu hỏi; 'other' → 'vi' như `knowledge.searchKb`.
  const detected = normalizeAndDetectLang({ text: sample.text, dict }).lang;
  const lang = detected === 'en' ? 'en' : 'vi';
  const vector = (await handle.embedder.embed([sample.text]))[0] as number[];
  const hits = await search(sample.text, lang, vector);
  const hitOrigins = hits.map((hit) => originOf(hit.chunkKey, origins));
  const rank = firstHitRank(hitOrigins, goldSet);
  rows.push({ id: sample.id, group: sample.group, rank });
  // Điểm tuyệt đối (cosine) của đoạn đúng tốt nhất; không có trong kết quả = 0 (phải rớt dưới mọi ngưỡng).
  positiveCos[sample.id] = Math.max(
    0,
    ...hits.flatMap((hit, i) =>
      goldSet.has(hitOrigins[i] as string) && hit.cosine !== null ? [hit.cosine] : [],
    ),
  );
  if (rank !== null && rank <= k) continue;
  const other = await search(sample.text, lang === 'en' ? 'vi' : 'en', vector);
  const top: TopHit[] = hits.slice(0, k).map((hit, i) => ({
    origin: hitOrigins[i] as string,
    chunkKey: hit.chunkKey,
    rrf: hit.score,
    relevance: rrfRelevance(hit.score),
    vector: hit.branches.vector,
    text: hit.branches.text,
    trigram: hit.branches.trigram,
    isGold: goldSet.has(hitOrigins[i] as string),
  }));
  diagnostics.push({
    id: sample.id,
    group: sample.group,
    text: sample.text,
    gold: [...goldSet],
    rank,
    top,
    relevanceFloor: DEFAULT_MIN_RELEVANCE,
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
  const detected = normalizeAndDetectLang({ text: sample.text, dict }).lang;
  const lang = detected === 'en' ? 'en' : 'vi';
  const vector = (await handle.embedder.embed([sample.text]))[0] as number[];
  const hits = await search(sample.text, lang, vector);
  negativeCos[sample.id] = Math.max(0, ...hits.slice(0, k).map((hit) => hit.cosine ?? 0));
}
const calibration = {
  ...calibrateThreshold(Object.values(positiveCos), Object.values(negativeCos)),
  scoreKind: `cosine ${handle.info.embeddingModel}`,
  positiveSamples: positiveCos,
  negativeSamples: negativeCos,
};
const metrics = aggregateRetrieval(rows, k);
const report = renderRetrievalReport({
  title: `Truy hồi trên đường production — ${shop.id}`,
  config: {
    'Bộ mẫu': `${values.dataset} (${picked.length} câu có gán đoạn đúng)`,
    'Nguồn kiến thức': `PRODUCTION — [EVAL] kb_version ${handle.info.kbVersion.number}`,
    Embedder: `${handle.info.embeddingModel} (bge-m3 thật, đoạn và truy vấn cùng model)`,
    'Cách tìm':
      'tìm lai: vector + toàn văn + trigram (RRF k=60), lọc lang theo câu hỏi, không lọc sản phẩm',
    'Ngưỡng liên quan dùng ở pipeline': String(DEFAULT_MIN_RELEVANCE),
    'Chi phí LiteLLM': '0 (không gọi LLM; chỉ embedding)',
  },
  metrics,
  failures: diagnostics,
  calibration,
});
mkdirSync(values.out as string, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = resolve(values.out as string, `retrieval-${shop.id}-${stamp}.md`);
writeFileSync(file, report);
console.log(report);
console.log(`\nĐã ghi: ${file}`);
await handle.close();
