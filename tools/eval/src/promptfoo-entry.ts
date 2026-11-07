import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalSampleSchema } from './dataset';
import { checkSample, type SampleChecks } from './metrics';
import { type Backend, createRunner } from './runner';
import { shopFixtureSchema } from './shop';

/**
 * Lớp nối promptfoo (docs/14 §4, MIT, ghim 0.125.1): `provider.mjs` gọi hàm này cho MỖI mẫu. Dùng lại đúng bộ chạy
 * (`createRunner`) và bộ chấm (`checkSample`) của `pnpm evaluate`, nên số liệu hai đường là MỘT. Trả về JSON đã chấm
 * (`checks`) để các `assert` của promptfoo chỉ việc đọc; kèm token/chi phí để promptfoo tổng hợp.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export type ProviderConfig = {
  backend?: Backend;
  shop?: string;
  classifyModel?: string;
  rewriteModel?: string;
  draftModel?: string;
  variantCount?: number;
  maxUsd?: number;
  maxCalls?: number;
};

export type ProviderResult = {
  output: string;
  tokenUsage: { prompt: number; completion: number; total: number };
  cost: number;
};

export function createProvider(
  config: ProviderConfig,
  env: Record<string, string | undefined> = process.env,
) {
  const shop = shopFixtureSchema.parse(
    JSON.parse(readFileSync(resolve(ROOT, config.shop ?? 'datasets/shops/demo-shop.json'), 'utf8')),
  );
  const runner = createRunner({
    backend: config.backend ?? 'mock',
    env,
    models: {
      classify: config.classifyModel ?? 'cf-classify',
      rewrite: config.rewriteModel ?? 'cf-classify',
      draft: config.draftModel ?? 'cf-draft',
    },
    ...(config.variantCount === undefined ? {} : { variantCount: config.variantCount }),
    maxUsd: config.maxUsd ?? 1,
    maxCalls: config.maxCalls ?? 600,
    shop,
  });
  return {
    async call(rawSample: unknown): Promise<ProviderResult> {
      const sample = evalSampleSchema.parse(rawSample);
      const outcome = await runner.run(sample);
      const checks: SampleChecks = checkSample(sample, outcome);
      const usage = outcome.usage;
      const prompt = usage.reduce((sum, record) => sum + record.inputTokens, 0);
      const completion = usage.reduce((sum, record) => sum + record.outputTokens, 0);
      return {
        output: JSON.stringify({
          id: sample.id,
          group: sample.group,
          ok: outcome.ok,
          checks,
          // Không đưa nội dung bình luận; chỉ kết quả đã chấm + câu trả lời của AI.
          ...(outcome.ok
            ? { label: outcome.label, action: outcome.action, reply: outcome.reply }
            : { error: outcome.errorKind }),
        }),
        tokenUsage: { prompt, completion, total: prompt + completion },
        cost: usage.reduce((sum, record) => sum + record.costUsd, 0),
      };
    },
  };
}
