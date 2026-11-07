// EVAL-RUNNER: chạy bộ mẫu qua pipeline AI, in/ghi báo cáo chỉ số §4.2 + chi phí/1.000 lượt tách theo bước.
//   pnpm --filter @flow/eval evaluate --backend litellm --classify-model cf-classify --draft-model cf-draft
//   pnpm --filter @flow/eval evaluate --backend mock            (không mạng, chi phí 0 — thử luồng)
// Không in nội dung bình luận hay khóa; tệp kết quả (`out/`, không commit) chỉ có mã mẫu, số liệu và câu trả lời của AI.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadEmbeddingService, resolveEmbeddingConfig } from '@flow/ai';
import { allowMockInThisProcess } from '@flow/shared';
import pg from 'pg';
import { parseDataset } from '../dataset';
import { EVAL_WORKSPACE } from '../eval-workspace';
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
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '3' },
    out: { type: 'string', default: resolve(ROOT, 'out') },
    'no-reduce': { type: 'boolean', default: false },
    'persist-usage': { type: 'boolean', default: false },
  },
});

// Model embedding hoạt động nằm ở DB (`cf.embedding_state`); env chỉ bật/tắt dịch vụ ml (FR-133). Báo cáo ghi cả hai; không đọc được DB → ghi rõ.
async function readActiveEmbeddingModel(): Promise<string | null | undefined> {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const result = await pool.query('SELECT active_model FROM cf.embedding_state');
    return (result.rows[0]?.active_model as string | null | undefined) ?? null;
  } catch {
    return undefined;
  } finally {
    await pool.end();
  }
}
const activeEmbeddingModel = await readActiveEmbeddingModel();
const embeddingInfo =
  activeEmbeddingModel === undefined
    ? {
        model: null,
        note: 'không đọc được model hoạt động từ DB (thiếu DATABASE_URL hoặc lỗi kết nối)',
      }
    : resolveEmbeddingConfig(loadEmbeddingService(process.env), activeEmbeddingModel).describe;
const backend = values.backend as Backend;
// EVAL chỉ đo model THẬT (LiteLLM + bge-m3). `--backend mock` (bản fixture chạy ở CI) phải tự khai báo và báo cáo ghi rõ "không phải số đo".
if (backend === 'mock')
  allowMockInThisProcess('EVAL --backend mock (fixture): không phải số đo chất lượng');
if (!['litellm', 'mock'].includes(backend)) {
  console.error('--backend phải là litellm | mock');
  process.exit(2);
}

const allSamples = parseDataset(readFileSync(values.dataset as string, 'utf8'));
const samples = values.limit ? allSamples.slice(0, Number(values.limit)) : allSamples;
const shop = shopFixtureSchema.parse(JSON.parse(readFileSync(values.shop as string, 'utf8')));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(values.out as string, { recursive: true });

// --persist-usage: ghi `ai_usage` THẬT (qua LlmClient) vào DB dev để đối chiếu chi phí LiteLLM ↔ ai_usage. Chỉ APP_ENV=dev + DB cf_dev.
let persistUsage: { db: unknown; workspaceId: string; close: () => Promise<void> } | undefined;
if (values['persist-usage']) {
  if (backend !== 'litellm') {
    console.error('--persist-usage chỉ dùng với --backend litellm');
    process.exit(2);
  }
  const url = process.env.DATABASE_URL ?? '';
  let dbName = '';
  try {
    dbName = new URL(url).pathname.replace(/^\//, '');
  } catch {}
  if (process.env.APP_ENV !== 'dev' || dbName !== 'cf_dev') {
    console.error('--persist-usage chỉ chạy khi APP_ENV=dev và DATABASE_URL trỏ database cf_dev.');
    process.exit(2);
  }
  const { createDb } = await import('@flow/db');
  const { workspaces } = await import('@flow/db/schema/core');
  const db = createDb({ connectionString: url, max: 3 });
  // MỘT workspace [EVAL] cố định, dùng lại mọi lần (tạo nếu chưa có; đã có → không làm gì).
  const workspaceId = EVAL_WORKSPACE.id;
  await db.withWorkspace(workspaceId, (tx) =>
    tx
      .insert(workspaces)
      .values({ id: workspaceId, name: EVAL_WORKSPACE.name, slug: EVAL_WORKSPACE.slug })
      .onConflictDoNothing(),
  );
  persistUsage = { db, workspaceId, close: () => db.close() };
  console.log(`Ghi ai_usage thật vào cf_dev, workspace ${workspaceId}`);
}

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
    shop,
    ...(persistUsage ? { persistUsage } : {}),
  });
  const outcomes = await runAll(samples, runner, Number(values.concurrency), (done, total) => {
    if (done % 10 === 0 || done === total) process.stderr.write(`  ${done}/${total}\r`);
  });
  const metrics = computeMetrics(samples, outcomes);
  const cost = costReport(outcomes, samples.length);
  const report = renderReport({
    title: `EVAL-RUNNER — ${backend}, ${variantCount + 1} phiên bản câu soạn`,
    config: {
      ...(backend === 'mock'
        ? {
            NHÃN: 'MOCK (fixture) — KHÔNG phải số đo chất lượng; không dùng để so sánh hay chọn model',
          }
        : {}),
      'Bộ mẫu': `${values.dataset} (${samples.length} mẫu)`,
      'Cửa hàng': shop.id,
      Backend: backend,
      'Model extract/rewrite/draft': `${values['classify-model']} / ${values['rewrite-model']} / ${values['draft-model']}`,
      'Số biến thể': `${variantCount} khác + câu gốc = ${variantCount + 1} phiên bản`,
      'Trần chi tiêu': 'max_budget của khóa ảo LiteLLM (không có trần riêng trong runner)',
      'Từ điển viết tắt': 'bản mẫu (DEMO_ABBREVIATIONS), không phải từ điển hệ thống của DB',
      // Ghi rõ embedder trong MỌI báo cáo (FR-133). Lấy từ ĐÚNG hàm cấu hình mà web/worker dùng (`resolveEmbeddingConfig`), không tự chọn.
      'Embedder (cấu hình ứng dụng)': `${embeddingInfo.model ?? 'tắt'} — ${embeddingInfo.note}`,
      'Embedder dùng trong lượt này':
        'không — cửa hàng mẫu tìm chính sách/FAQ bằng từ khóa (searchShopTexts) và khớp sản phẩm bằng từ khóa/trigram; chưa có nhánh vector ở EVAL',
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
  return { report, cost, base };
}

const variantCount = Math.min(4, Math.max(0, Number(values.variants)));
const first = await runOnce(variantCount);
console.log(first.report);
console.log(`\nĐã ghi: ${first.base}.md và .jsonl`);

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

if (persistUsage) await persistUsage.close();
