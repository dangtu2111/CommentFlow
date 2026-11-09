// EVAL-RUNNER: chạy bộ mẫu qua pipeline AI, in/ghi báo cáo chỉ số §4.2 + chi phí/1.000 lượt tách theo bước.
//   pnpm --filter @flow/eval evaluate --backend litellm --classify-model cf-classify --draft-model cf-draft
//   pnpm --filter @flow/eval evaluate --backend mock            (không mạng, chi phí 0 — thử luồng)
// Không in nội dung bình luận hay khóa; tệp kết quả (`out/`, không commit) chỉ có mã mẫu, số liệu và câu trả lời của AI.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { TryKnowledge } from '@flow/ai';
import { loadEmbeddingService, policyFactsFromRows, resolveEmbeddingConfig } from '@flow/ai';
import { allowMockInThisProcess } from '@flow/shared';
import pg from 'pg';
import {
  DEFAULT_MEASUREMENT_CAP_USD,
  DEFAULT_TOTAL_CAP_USD,
  decideBudget,
  readKeySpend,
  sumLedger,
} from '../budget';
import { parseDataset } from '../dataset';
import { EVAL_WORKSPACE } from '../eval-workspace';
import { checkSample, computeMetrics } from '../metrics';
import { findFlakySamples, renderMultiRun } from '../multi-run';
import type { ProductionKnowledgeInfo } from '../production/prepare';
import { assertDevDatabase } from '../production/seed';
import { describeProduction, openProduction } from '../production/setup';
import { costReport, renderReport } from '../report';
import { type Backend, createRunner, runAll } from '../runner';
import { shopFixtureSchema } from '../shop';
import { createPgTrigramScorer, type TrigramScorer } from '../shop-trigram';
import { renderSlotReport } from '../slot-metrics';

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
    // Đường fact plan (ADR 017): dùng `policyFacts` (đã duyệt) trong shop file; code điền số/chính sách. Mặc định tắt = đường cũ.
    'fact-slots': { type: 'boolean', default: false },
    // Khớp sản phẩm: `trigram` (mặc định khi có DB dev/test) = ĐÚNG như production qua pg_trgm; `substring` = cũ (offline, quá chặt với tên dài).
    matcher: { type: 'string', default: 'trigram' },
    // Nguồn kiến thức: `production` (mặc định với litellm) = nạp shop file vào workspace [EVAL] → đồng bộ → xuất bản → loadWorkspaceKnowledge (vector bge-m3 thật);
    // `fixture` = tìm bằng từ khóa trong shop file (cũ, KHÔNG phản ánh production).
    knowledge: { type: 'string' },
    // Số lượt chạy mỗi bên (mặc định 3 với litellm, 1 với mock) và hạt giống bước extract (nhiệt độ luôn 0).
    repeats: { type: 'string' },
    seed: { type: 'string', default: '42' },
    // Thử nghiệm bước soạn (đo xen kẽ): nhiệt độ khác mặc định 0,3 và/hoặc seed cố định cho bước soạn.
    'draft-temperature': { type: 'string' },
    'draft-seed': { type: 'string' },
    // Trần chi phí (chủ dự án chốt 08/11/2026): mỗi lần đo ≤ 1 USD, tổng sổ chi tiêu ≤ 5 USD, khóa ảo > 80% trần → dừng.
    'max-usd': { type: 'string', default: String(DEFAULT_MEASUREMENT_CAP_USD) },
    'total-cap-usd': { type: 'string', default: String(DEFAULT_TOTAL_CAP_USD) },
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

// Bộ khớp sản phẩm như production: cần kết nối DB (chỉ gọi hàm pg_trgm, không đọc/ghi bảng) → chỉ cf_dev / cf_test.
let scorer: TrigramScorer | undefined;
let scorerPool: { end: () => Promise<void> } | undefined;
if (values.matcher === 'trigram' && backend === 'litellm') {
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.TEST_DATABASE_ADMIN_URL ?? '';
  let name = '';
  try {
    name = new URL(adminUrl).pathname.replace(/^\//, '');
  } catch {}
  if (!/^(cf_dev|cf_test(_[a-z0-9]{1,8})?)$/.test(name)) {
    console.error(
      'Bộ khớp "trigram" cần DATABASE_ADMIN_URL trỏ cf_dev/cf_test (hoặc dùng --matcher substring).',
    );
    process.exit(2);
  }
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({ connectionString: adminUrl, max: 2 });
  scorer = createPgTrigramScorer(pool);
  scorerPool = pool;
  console.log('Khớp sản phẩm: pg_trgm như production.');
} else if (backend === 'litellm') {
  console.log('Khớp sản phẩm: "tên chứa lời nhắc" (cũ, KHÔNG phản ánh production).');
}

const repeats = Math.max(1, Number(values.repeats ?? (backend === 'litellm' ? 3 : 1)));
const seed = Number(values.seed);
const knowledgeMode = (values.knowledge ??
  (backend === 'litellm' ? 'production' : 'fixture')) as string;
if (!['production', 'fixture'].includes(knowledgeMode)) {
  console.error('--knowledge phải là production | fixture');
  process.exit(2);
}
if (knowledgeMode === 'production' && backend !== 'litellm') {
  console.error('--knowledge production chỉ dùng với --backend litellm');
  process.exit(2);
}

// Đường production: nạp [EVAL] → đồng bộ → xuất bản → loadWorkspaceKnowledge. Chỉ cf_dev/cf_test.
let productionInfo: ProductionKnowledgeInfo | undefined;
let productionKnowledge: TryKnowledge | undefined;
let closeProduction: (() => Promise<void>) | undefined;
let vectorFailures = () => 0;
if (knowledgeMode === 'production') {
  try {
    const handle = await openProduction(shop, process.env);
    productionInfo = handle.info;
    productionKnowledge = handle.knowledge;
    vectorFailures = handle.vectorFailures;
    closeProduction = handle.close;
    console.log(describeProduction(handle.info));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Cấu hình DB không hợp lệ.');
    process.exit(2);
  }
}

// ---- Trần chi phí: sổ chi tiêu cộng dồn cho cả chuỗi việc (out/ không commit) + chi tiêu khóa ảo LiteLLM ----
const perMeasurementCap = Number(values['max-usd']);
const totalCap = Number(values['total-cap-usd']);
// Sổ chi tiêu CỐ ĐỊNH (không phụ thuộc --out) để trần tổng thật sự cộng dồn qua mọi lần đo.
const ledgerFile = resolve(ROOT, 'out', 'eval-spend-ledger.jsonl');
const ledgerSpent = existsSync(ledgerFile) ? sumLedger(readFileSync(ledgerFile, 'utf8')) : 0;
const startedAt = new Date();
const keyNow = () =>
  backend === 'litellm' && process.env.LITELLM_BASE_URL && process.env.LITELLM_API_KEY
    ? readKeySpend(fetch, process.env.LITELLM_BASE_URL, process.env.LITELLM_API_KEY)
    : Promise.resolve(null);
const runUsd = (cost: { steps: { costUsd: number }[] }) =>
  cost.steps.reduce((total, step) => total + step.costUsd, 0);
if (backend === 'litellm') {
  const gate = decideBudget({
    perMeasurementCap,
    totalCap,
    measurementSpent: 0,
    ledgerSpent,
    nextRunEstimate: 0,
    key: await keyNow(),
  });
  if (gate.stop) {
    console.error(`DỪNG trước khi chạy (hỏi chủ dự án): ${gate.message}`);
    process.exit(3);
  }
}

// Chính sách đã duyệt của shop → fact plan (mỗi dòng như một `cf.policy_facts` approved; nguồn `pf:eval-<n>`).
const factSlots = values['fact-slots']
  ? (() => {
      const { policy, issues } = policyFactsFromRows(
        shop.policyFacts.map((row, i) => ({
          id: `eval-${i}`,
          kind: row.kind,
          data: row.data,
          status: 'approved',
        })),
      );
      if (issues.length > 0) {
        console.error(issues.join(String.fromCharCode(10)));
        process.exit(2);
      }
      return { policy, stock: { disclose: 'count' as const, lowAt: null } }; // gold hỏi "còn mấy cái" → giả định Owner bật "Nêu số lượng tồn"
    })()
  : undefined;

async function runOnce(variantCount: number, runIndex = 1) {
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
    seed,
    draft: {
      ...(values['draft-temperature'] === undefined
        ? {}
        : { temperature: Number(values['draft-temperature']) }),
      ...(values['draft-seed'] === undefined ? {} : { seed: Number(values['draft-seed']) }),
    },
    ...(factSlots ? { factSlots } : {}),
    ...(productionKnowledge ? { knowledge: productionKnowledge } : {}),
    ...(scorer ? { scorer } : {}),
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
      'Nguồn kiến thức': productionInfo
        ? `PRODUCTION — workspace [EVAL] đã đồng bộ + xuất bản; kb_version ${productionInfo.kbVersion.number}; tìm lai vector ${productionInfo.embeddingModel} + toàn văn + trigram (loadWorkspaceKnowledge)`
        : 'fixture — từ khóa trong shop file (KHÔNG phản ánh production)',
      'Cấu hình lấy mẫu': `extract: nhiệt độ 0, seed ${seed}; soạn: nhiệt độ ${values['draft-temperature'] ?? '0,3 (mặc định)'}, seed ${values['draft-seed'] ?? 'không'}`,
      'Embedder dùng trong lượt này': productionInfo
        ? `${productionInfo.embeddingModel} (bge-m3 thật qua dịch vụ ml; đoạn kiến thức và truy vấn cùng model)`
        : 'không — cửa hàng mẫu tìm chính sách/FAQ bằng từ khóa (searchShopTexts) và khớp sản phẩm bằng từ khóa/trigram; chưa có nhánh vector ở EVAL',
      'Khớp sản phẩm': productionInfo
        ? 'production (findProductMatch trên DB [EVAL]; vector tên sản phẩm chưa nạp trong EVAL)'
        : scorer
          ? 'pg_trgm như production (similarity/word_similarity, ngưỡng 0,3/0,4; bí danh 0,6; chọn/mơ hồ 0,45/0,05)'
          : '"tên chứa lời nhắc" (cũ, KHÔNG phản ánh production)',
    },
    samples,
    metrics,
    cost,
    outcomes,
  });
  const base = resolve(
    values.out as string,
    `eval-${backend}-v${variantCount}-${stamp}${runIndex > 1 ? `-r${runIndex}` : ''}`,
  );
  const slotSection = factSlots ? renderSlotReport(samples, outcomes, shop) : '';
  writeFileSync(`${base}.md`, report + slotSection);
  writeFileSync(
    `${base}.jsonl`,
    `${[...outcomes.values()].map((outcome) => JSON.stringify(outcome)).join('\n')}\n`,
  );
  return { report, cost, base, metrics, outcomes };
}

const variantCount = Math.min(4, Math.max(0, Number(values.variants)));
const first = await runOnce(variantCount);
console.log(first.report);
console.log(`\nĐã ghi: ${first.base}.md và .jsonl`);

// Vượt trần $2/1.000 lượt → thử giảm số biến thể 5 → 3 trước (Q-LLM2) và ghi kết quả so sánh.
if (first.cost.overBudget && variantCount > 2 && !values['no-reduce'] && repeats === 1) {
  console.log('\n⚠ Vượt $2/1.000 lượt — thử giảm biến thể 5 → 3 phiên bản…');
  const reduced = await runOnce(2);
  console.log(
    `\nSo sánh: 5 phiên bản $$first.cost.totalUsdPer1000.toFixed(3)→ 3 phiên bản $$reduced.cost.totalUsdPer1000.toFixed(3)/ 1.000 lượt` +
      (reduced.cost.overBudget ? ' (VẪN vượt trần)' : ' (đạt trần)'),
  );
  console.log(`Đã ghi: ${reduced.base}.md và .jsonl`);
}

// Nhiều lượt (EVAL-RELIABILITY): trung bình + min/max theo nhóm, cổng theo LƯỢT TỆ NHẤT, mẫu chập chờn. Mỗi lượt kế tiếp phải qua trần chi phí.
const runs = [first];
let measurementSpent = runUsd(first.cost);
let stoppedBy: string | null = null;
for (let i = 2; i <= repeats; i += 1) {
  const decision = decideBudget({
    perMeasurementCap,
    totalCap,
    measurementSpent,
    ledgerSpent,
    nextRunEstimate: runUsd(runs[runs.length - 1]?.cost ?? first.cost),
    key: await keyNow(),
  });
  if (decision.stop) {
    stoppedBy = decision.message;
    console.error(`\nDỪNG sau ${runs.length}/${repeats} lượt (hỏi chủ dự án): ${decision.message}`);
    break;
  }
  console.log(`\nLượt ${i}/${repeats}…`);
  const next = await runOnce(variantCount, i);
  runs.push(next);
  measurementSpent += runUsd(next.cost);
}

// Chi phí THẬT: LiteLLM (header từng lần gọi) và, khi --persist-usage, tổng `ai_usage` ghi trong lần đo này.
let aiUsageLine = 'không ghi ai_usage (thiếu --persist-usage)';
if (persistUsage) {
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? '';
  if (adminUrl) {
    assertDevDatabase(adminUrl);
    const pgMod = (await import('pg')).default;
    const pool = new pgMod.Pool({ connectionString: adminUrl, max: 1 });
    try {
      const r = await pool.query(
        'SELECT coalesce(sum(cost_usd), 0)::float8 AS usd, count(*)::int AS calls FROM cf.ai_usage WHERE workspace_id = $1 AND created_at >= $2',
        [persistUsage.workspaceId, startedAt],
      );
      aiUsageLine = `ai_usage (workspace [EVAL]): $${Number(r.rows[0].usd).toFixed(4)} cho ${r.rows[0].calls} lần gọi`;
    } finally {
      await pool.end();
    }
  }
}
const keyAfter = await keyNow();
const spendLine = [
  `Chi phí lần đo (LiteLLM, ${runs.length} lượt): $${measurementSpent.toFixed(4)} / trần $${perMeasurementCap}`,
  aiUsageLine,
  `Tổng theo sổ trước lần đo: $${ledgerSpent.toFixed(4)}; sau: $${(ledgerSpent + measurementSpent).toFixed(4)} / trần $${totalCap}`,
  keyAfter
    ? `Khóa ảo LiteLLM: đã tiêu $${keyAfter.spend.toFixed(2)}${keyAfter.maxBudget === null ? ' (không có trần)' : ` / $${keyAfter.maxBudget} (${((keyAfter.spend / keyAfter.maxBudget) * 100).toFixed(0)}%)`}`
    : 'Khóa ảo LiteLLM: không đọc được chi tiêu',
].join('\n- ');
if (backend === 'litellm') {
  mkdirSync(dirname(ledgerFile), { recursive: true });
  appendFileSync(
    ledgerFile,
    `${JSON.stringify({ at: new Date().toISOString(), dataset: values.dataset, shop: shop.id, runs: runs.length, usd: measurementSpent })}\n`,
  );
}
console.log(`\n- ${spendLine}`);

if (repeats > 1) {
  const groups: Record<string, (typeof first.metrics.all)[]> = {
    all: runs.map((r) => r.metrics.all),
  };
  for (const group of Object.keys(
    first.metrics.byGroup,
  ) as (keyof typeof first.metrics.byGroup)[]) {
    if (first.metrics.byGroup[group].samples > 0) {
      groups[group] = runs.map((r) => r.metrics.byGroup[group]);
    }
  }
  const perRunChecks = runs.map(
    (r) =>
      new Map(
        samples.flatMap((sample) => {
          const outcome = r.outcomes.get(sample.id);
          return outcome ? ([[sample.id, checkSample(sample, outcome)]] as const) : [];
        }),
      ),
  );
  const header = [
    `# EVAL nhiều lượt — ${backend}, ${runs.length}/${repeats} lượt${stoppedBy ? ' (DỪNG SỚM)' : ''}`,
    '',
    `- Bộ mẫu: ${values.dataset} (${samples.length} mẫu); cửa hàng: ${shop.id}`,
    `- Model extract/rewrite/draft: ${values['classify-model']} / ${values['rewrite-model']} / ${values['draft-model']}`,
    `- Lấy mẫu: extract nhiệt độ 0, seed ${seed}`,
    productionInfo
      ? `- Nguồn kiến thức: PRODUCTION — [EVAL] kb_version ${productionInfo.kbVersion.number}, embedder ${productionInfo.embeddingModel}, sản phẩm ${productionInfo.seed.products}, chính sách ${productionInfo.seed.policies}, FAQ ${productionInfo.seed.faqs}; lỗi vector trong lượt chạy: ${vectorFailures()}`
      : '- Nguồn kiến thức: fixture (từ khóa; KHÔNG phản ánh production)',
    `- Embedder cấu hình ứng dụng: ${embeddingInfo.model ?? 'tắt'} — ${embeddingInfo.note}`,
    backend === 'mock' ? '- NHÃN: MOCK (fixture) — KHÔNG phải số đo chất lượng' : '',
    ...(stoppedBy ? [`- ⚠ DỪNG SỚM do trần chi phí: ${stoppedBy}`] : []),
    `- ${spendLine}`,
    '',
  ].join('\n');
  const multi = `${header}\n${renderMultiRun({
    title: `So sánh ${runs.length} lượt`,
    repeats: runs.length,
    groups,
    flaky: findFlakySamples(samples, perRunChecks),
  })}`;
  const multiBase = resolve(values.out as string, `eval-multi-${backend}-${stamp}`);
  writeFileSync(`${multiBase}.md`, multi);
  console.log(`\n${multi}`);
  console.log(`Đã ghi: ${multiBase}.md`);
}

if (persistUsage) await persistUsage.close();
if (scorerPool) await scorerPool.end();
if (closeProduction) await closeProduction();
if (stoppedBy) process.exit(3);
