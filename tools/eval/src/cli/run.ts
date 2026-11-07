// EVAL-RUNNER: chạy bộ mẫu qua pipeline AI, in/ghi báo cáo chỉ số §4.2 + chi phí/1.000 lượt tách theo bước.
//   pnpm --filter @flow/eval evaluate --backend openai-direct --max-usd 1
//   pnpm --filter @flow/eval evaluate --backend litellm --classify-model cf-classify --draft-model cf-draft
//   pnpm --filter @flow/eval evaluate --backend mock            (không mạng, chi phí 0 — thử luồng)
// Không in nội dung bình luận hay khóa; tệp kết quả (`out/`, không commit) chỉ có mã mẫu, số liệu và câu trả lời của AI.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseDataset } from '../dataset';
import { computeMetrics } from '../metrics';
import { costReport, renderReport } from '../report';
import { type Backend, createRunner, runAll } from '../runner';
import { shopFixtureSchema } from '../shop';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const { values } = parseArgs({
  options: {
    dataset: { type: 'string', default: resolve(ROOT, 'datasets/synthetic-demo.jsonl') },
    shop: { type: 'string', default: resolve(ROOT, 'datasets/shops/demo-shop.json') },
    backend: { type: 'string', default: 'litellm' },
    'classify-model': { type: 'string', default: 'cf-classify' },
    'rewrite-model': { type: 'string', default: 'cf-classify' },
    'draft-model': { type: 'string', default: 'cf-draft' },
    variants: { type: 'string', default: '4' },
    'max-usd': { type: 'string', default: '1' },
    'max-calls': { type: 'string', default: '600' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '3' },
    out: { type: 'string', default: resolve(ROOT, 'out') },
    'no-reduce': { type: 'boolean', default: false },
  },
});

const backend = values.backend as Backend;
if (!['litellm', 'openai-direct', 'mock'].includes(backend)) {
  console.error('--backend phải là litellm | openai-direct | mock');
  process.exit(2);
}

const allSamples = parseDataset(readFileSync(values.dataset as string, 'utf8'));
const samples = values.limit ? allSamples.slice(0, Number(values.limit)) : allSamples;
const shop = shopFixtureSchema.parse(JSON.parse(readFileSync(values.shop as string, 'utf8')));
const maxUsd = Number(values['max-usd']);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(values.out as string, { recursive: true });

async function runOnce(variantCount: number) {
  const runner = createRunner({
    backend,
    env: process.env,
    models: {
      classify: values['classify-model'] as string,
      rewrite: values['rewrite-model'] as string,
      draft: values['draft-model'] as string,
    },
    variantCount,
    maxUsd,
    maxCalls: Number(values['max-calls']),
    shop,
  });
  const outcomes = await runAll(samples, runner, Number(values.concurrency), (done, total) => {
    if (done % 10 === 0 || done === total) process.stderr.write(`  ${done}/${total}\r`);
  });
  const metrics = computeMetrics(samples, outcomes);
  const cost = costReport(outcomes, samples.length);
  const report = renderReport({
    title: `EVAL-RUNNER — ${backend}, ${variantCount + 1} phiên bản câu soạn`,
    config: {
      'Bộ mẫu': `${values.dataset} (${samples.length} mẫu)`,
      'Cửa hàng': shop.id,
      Backend: backend,
      'Model extract/rewrite/draft': `${values['classify-model']} / ${values['rewrite-model']} / ${values['draft-model']}`,
      'Số biến thể': `${variantCount} khác + câu gốc = ${variantCount + 1} phiên bản`,
      'Trần chi tiêu runner': `${maxUsd} USD`,
      'Từ điển viết tắt': 'bản mẫu (DEMO_ABBREVIATIONS), không phải từ điển hệ thống của DB',
    },
    samples,
    metrics,
    cost,
    outcomes,
  });
  const base = resolve(values.out as string, `eval-${backend}-v${variantCount}-${stamp}`);
  writeFileSync(`${base}.md`, report);
  writeFileSync(
    `${base}.jsonl`,
    `${[...outcomes.values()].map((outcome) => JSON.stringify(outcome)).join('\n')}\n`,
  );
  return { report, cost, base, spent: runner.spent() };
}

const variantCount = Math.min(4, Math.max(0, Number(values.variants)));
const first = await runOnce(variantCount);
console.log(first.report);
console.log(`\nĐã ghi: ${first.base}.md và .jsonl`);
if (first.spent)
  console.log(
    `Chi tiêu ước tính (openai-direct): ${first.spent.calls} lần gọi, $${first.spent.usd.toFixed(4)}`,
  );

// Vượt trần $2/1.000 lượt → thử giảm số biến thể 5 → 3 trước (Q-LLM2) và ghi kết quả so sánh.
if (first.cost.overBudget && variantCount > 2 && !values['no-reduce']) {
  console.log('\n⚠ Vượt $2/1.000 lượt — thử giảm biến thể 5 → 3 phiên bản…');
  const reduced = await runOnce(2);
  console.log(
    `\nSo sánh: 5 phiên bản $${first.cost.totalUsdPer1000.toFixed(3)} → 3 phiên bản $${reduced.cost.totalUsdPer1000.toFixed(3)} / 1.000 lượt` +
      (reduced.cost.overBudget ? ' (VẪN vượt trần)' : ' (đạt trần)'),
  );
  console.log(`Đã ghi: ${reduced.base}.md và .jsonl`);
}
