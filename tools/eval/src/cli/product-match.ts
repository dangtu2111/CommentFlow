// (1b) Đo KHỚP SẢN PHẨM trên đường production (docs/10 §5.1): trigram thuần (cũ) / lai "lấy max" / lai + token đặc trưng / lai RRF, quét ngưỡng cosine.
//   pnpm --filter @flow/eval run product-match --shop datasets/shops/sswiftly.json --gold datasets/product-match/sswiftly.jsonl --out out/product-match
// Không gọi LLM (chỉ embedding bge-m3 qua ml + tìm trong DB `[EVAL]` của cf_dev) nên không tốn chi phí LiteLLM.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { searchProducts } from '@flow/db';
import {
  hybridProductScores,
  normalizeSearchText,
  PRODUCT_MATCH_MARGIN,
  PRODUCT_MIN_COSINE,
  type ProductMatch,
  pickProductMatch,
} from '@flow/shared';
import { z } from 'zod';
import { EVAL_WORKSPACE } from '../eval-workspace';
import { describeProduction, openProduction } from '../production/setup';
import { shopFixtureSchema } from '../shop';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values } = parseArgs({
  options: {
    shop: { type: 'string' },
    gold: { type: 'string' },
    out: { type: 'string', default: resolve(ROOT, 'out/product-match') },
  },
});
if (!values.shop || !values.gold) {
  console.error('Cần --shop và --gold.');
  process.exit(2);
}

const goldRow = z.object({
  id: z.string(),
  mention: z.string(),
  kind: z.enum(['match', 'ambiguous', 'none']),
  gold: z.array(z.string()),
  note: z.string().optional(),
});
const gold = readFileSync(values.gold, 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => goldRow.parse(JSON.parse(l)));
const shop = shopFixtureSchema.parse(JSON.parse(readFileSync(values.shop, 'utf8')));
const handle = await openProduction(shop, process.env).catch((error) => {
  console.error(error instanceof Error ? error.message : 'Cấu hình DB không hợp lệ.');
  return process.exit(2);
});
console.log(describeProduction(handle.info));
const workspaceId = EVAL_WORKSPACE.id;

type Hit = Awaited<ReturnType<typeof searchProducts>>[number];
const hitsOf = new Map<string, Hit[]>();
for (const row of gold) {
  const vector = (await handle.embedder.embed([row.mention]))[0] as number[];
  hitsOf.set(
    row.id,
    await handle.db.withJob(workspaceId, (tx) =>
      searchProducts(tx, {
        workspaceId,
        queryText: row.mention,
        queryVector: vector,
        embeddingModel: handle.embedder.model,
        limit: 10,
      }),
    ),
  );
}

type Strategy = { name: string; decide: (hits: Hit[], mention: string, m: number) => ProductMatch };
const rrfDecide = (hits: Hit[], m: number): ProductMatch => {
  const gated = hits.filter((h) => h.similarity >= 0.45 || (h.cosine ?? 0) >= m);
  const top = gated[0]?.score ?? 0;
  return pickProductMatch(
    gated.map((h) => ({ id: h.id, score: top === 0 ? 0 : h.score / top })),
    { threshold: 0, margin: PRODUCT_MATCH_MARGIN },
  );
};
const strategies: Strategy[] = [
  {
    name: 'A trigram thuần (cũ)',
    decide: (hits) => pickProductMatch(hits.map((h) => ({ id: h.id, score: h.similarity }))),
  },
  {
    name: 'B lai max',
    decide: (hits, _mention, m) => pickProductMatch(hybridProductScores(hits, { minCosine: m })),
  },
  {
    name: 'C lai max + token',
    decide: (hits, mention, m) =>
      pickProductMatch(hybridProductScores(hits, { minCosine: m, mention })),
  },
  { name: 'D lai RRF (cổng bằng bằng chứng)', decide: (hits, _mention, m) => rrfDecide(hits, m) },
];

type Outcome = 'correct' | 'clarify_ok' | 'wrong' | 'miss';
/** Id sản phẩm trong DB `[EVAL]` có tên bắt đầu bằng một trong các tên gold (id DB khác id trong file shop, nên so theo TÊN). */
function goldIdsOf(row: z.infer<typeof goldRow>): Set<string> {
  const ids = new Set<string>();
  for (const hit of hitsOf.get(row.id) ?? []) {
    if (row.gold.some((g) => hit.name.startsWith(g))) ids.add(hit.id);
  }
  return ids;
}
function grade(row: z.infer<typeof goldRow>, match: ProductMatch): Outcome {
  const wanted = goldIdsOf(row);
  if (row.kind === 'none') return match.status === 'none' ? 'correct' : 'wrong';
  if (row.kind === 'ambiguous') {
    if (match.status === 'ambiguous') {
      return match.ids.every((id) => wanted.has(id)) ? 'correct' : 'wrong';
    }
    return match.status === 'none' ? 'miss' : 'wrong';
  }
  if (match.status === 'matched') return wanted.has(match.id) ? 'correct' : 'wrong';
  if (match.status === 'ambiguous') {
    return match.ids.includes([...wanted][0] as string) && match.ids.length <= 3
      ? 'clarify_ok'
      : 'wrong';
  }
  return 'miss';
}

const sweep = [0.5, 0.55, 0.6, 0.62, 0.65, 0.7, 0.75, 0.8];
const lines: string[] = [];
const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
lines.push(
  `# Khớp sản phẩm — ${shop.id} (${gold.length} câu: ${gold.filter((r) => r.kind === 'match').length} khớp, ${gold.filter((r) => r.kind === 'ambiguous').length} mơ hồ, ${gold.filter((r) => r.kind === 'none').length} không bán)`,
  '',
  `Embedder ${handle.info.embeddingModel}; hiện hành: cosine tối thiểu ${PRODUCT_MIN_COSINE}.`,
  '',
  '| Chiến lược | cosine tối thiểu | đúng | hỏi lại đúng | SAI (khớp nhầm) | sót | đúng+hỏi lại |',
  '|---|---|---|---|---|---|---|',
);
const best: { name: string; m: number; wrong: number; ok: number }[] = [];
for (const strategy of strategies) {
  const thresholds = strategy.name.startsWith('A') ? [0] : sweep;
  for (const m of thresholds) {
    const tally: Record<Outcome, number> = { correct: 0, clarify_ok: 0, wrong: 0, miss: 0 };
    for (const row of gold) {
      const match = strategy.decide(hitsOf.get(row.id) as Hit[], row.mention, m);
      tally[grade(row, match)] += 1;
    }
    best.push({ name: strategy.name, m, wrong: tally.wrong, ok: tally.correct + tally.clarify_ok });
    lines.push(
      `| ${strategy.name} | ${m === 0 ? '—' : m} | ${tally.correct} | ${tally.clarify_ok} | ${tally.wrong} | ${tally.miss} | ${pct(tally.correct + tally.clarify_ok, gold.length)} |`,
    );
  }
}

// Phân bố cosine của sản phẩm ĐÚNG tốt nhất (dương) và sản phẩm sai cao nhất (âm: câu không bán) để chọn ngưỡng.
const positives: number[] = [];
const negatives: number[] = [];
for (const row of gold) {
  const hits = hitsOf.get(row.id) as Hit[];
  const wanted = goldIdsOf(row);
  if (row.kind === 'none') negatives.push(Math.max(0, ...hits.map((h) => h.cosine ?? 0)));
  else
    positives.push(Math.max(0, ...hits.filter((h) => wanted.has(h.id)).map((h) => h.cosine ?? 0)));
}
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return `min ${s[0]?.toFixed(3)} · p25 ${s[Math.floor(s.length * 0.25)]?.toFixed(3)} · trung vị ${s[Math.floor(s.length / 2)]?.toFixed(3)} · max ${s.at(-1)?.toFixed(3)}`;
};
lines.push(
  '',
  `Cosine sản phẩm đúng (n=${positives.length}): ${stats(positives)}`,
  `Cosine sản phẩm gần nhất của câu KHÔNG bán (n=${negatives.length}): ${stats(negatives)}`,
  '',
  '## Từng câu (chiến lược C @ ngưỡng hiện hành)',
  '',
  '| id | lời nhắc | loại | kết quả | top-3 (tên · trigram · cosine) |',
  '|---|---|---|---|---|',
);
for (const row of gold) {
  const hits = hitsOf.get(row.id) as Hit[];
  const match = strategies[2]?.decide(hits, row.mention, PRODUCT_MIN_COSINE) as ProductMatch;
  const top = hits
    .slice(0, 3)
    .map(
      (h) => `${h.name.slice(0, 28)} · ${h.similarity.toFixed(2)} · ${h.cosine?.toFixed(2) ?? '—'}`,
    )
    .join(' ‖ ');
  lines.push(
    `| ${row.id} | ${normalizeSearchText(row.mention)} | ${row.kind} | ${grade(row, match)} (${match.status}) | ${top} |`,
  );
}
const report = lines.join('\n');
mkdirSync(values.out as string, { recursive: true });
const file = resolve(
  values.out as string,
  `product-match-${shop.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`,
);
writeFileSync(file, report);
console.log(report);
console.log(`\nĐã ghi: ${file}`);
await handle.close();
