import {
  createAbbreviationDict,
  createDemoDrafter,
  createDemoExtractor,
  createDemoKnowledge,
  createLlmClient,
  createLlmDrafter,
  createLlmExtractor,
  createLlmRewriter,
  DEMO_ABBREVIATIONS,
  type LlmClient,
} from '@flow/ai';
import type { EvalSample } from './dataset';
import { createOpenAiDirectFetch, OPENAI_BASE_URL } from './openai-direct';
import { noopUsageDb, recordUsage } from './recording-llm';
import { type PipelineParts, runSample, type SampleOutcome } from './run-sample';
import { buildShopKnowledge, type ShopFixture, shopVoice } from './shop';

/**
 * Dựng bộ chạy theo backend:
 *  - `litellm`: gọi qua LiteLLM (đúng thiết kế, trần chi phí do `max_budget` của khóa ảo; chi phí lấy từ header LiteLLM);
 *  - `openai-direct`: gọi thẳng OpenAI bằng `OPENAI_API_KEY` khi chưa có LiteLLM (bộ chuyển đổi dịch tham số + trần riêng);
 *  - `mock`: bản mô phỏng theo từ khóa của ô Thử AI, KHÔNG gọi mạng, chi phí 0 — chỉ để thử luồng runner/promptfoo.
 * Tên model là BÍ DANH LiteLLM (`cf-classify`, `cf-draft`, hoặc `cand-*`): đổi model không sửa code.
 */
export type Backend = 'litellm' | 'openai-direct' | 'mock';

export type RunnerOptions = {
  backend: Backend;
  env: Record<string, string | undefined>;
  models: { classify: string; rewrite: string; draft: string };
  /** Số cách diễn đạt KHÁC của câu soạn (0–4); 4 = 5 phiên bản, 2 = 3 phiên bản. */
  variantCount?: number;
  maxUsd: number;
  maxCalls: number;
  shop: ShopFixture;
};

export type Runner = {
  run: (sample: EvalSample) => Promise<SampleOutcome>;
  /** Chi tiêu ước tính của backend `openai-direct`; các backend khác `null` (chi phí nằm trong từng `UsageRecord`). */
  spent: () => { calls: number; usd: number } | null;
};

function requireEnv(env: RunnerOptions['env'], name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường ${name}.`);
  return value;
}

export function createRunner(options: RunnerOptions): Runner {
  const knowledge =
    options.backend === 'mock' ? createDemoKnowledge() : buildShopKnowledge(options.shop);
  const dict = createAbbreviationDict(DEMO_ABBREVIATIONS);
  const voice = shopVoice(options.shop);

  let client: LlmClient | null = null;
  let direct: ReturnType<typeof createOpenAiDirectFetch> | null = null;
  if (options.backend === 'litellm') {
    client = createLlmClient({
      db: noopUsageDb as never,
      baseUrl: requireEnv(options.env, 'LITELLM_BASE_URL'),
      apiKey: requireEnv(options.env, 'LITELLM_API_KEY'),
    });
  } else if (options.backend === 'openai-direct') {
    const apiKey = requireEnv(options.env, 'OPENAI_API_KEY');
    direct = createOpenAiDirectFetch({
      apiKey,
      maxCalls: options.maxCalls,
      maxUsd: options.maxUsd,
    });
    client = createLlmClient({
      db: noopUsageDb as never,
      baseUrl: OPENAI_BASE_URL,
      apiKey,
      fetchImpl: direct,
    });
  }

  return {
    run: (sample) =>
      runSample(sample, {
        knowledge,
        voice,
        dict,
        ...(options.variantCount === undefined ? {} : { variantCount: options.variantCount }),
        build: (sink): PipelineParts => {
          if (!client) return { extractor: createDemoExtractor(), drafter: createDemoDrafter() };
          const llm = recordUsage(client, sink);
          return {
            extractor: createLlmExtractor({ llm, model: options.models.classify }),
            rewriter: createLlmRewriter({ llm, model: options.models.rewrite }),
            drafter: createLlmDrafter({ llm, model: options.models.draft }),
          };
        },
      }),
    spent: () => (direct ? direct.stats() : null),
  };
}

/** Chạy tối đa `concurrency` mẫu song song, giữ thứ tự mẫu trong kết quả. */
export async function runAll(
  samples: readonly EvalSample[],
  runner: Runner,
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, SampleOutcome>> {
  const outcomes = new Map<string, SampleOutcome>();
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < samples.length) {
      const sample = samples[next];
      next += 1;
      if (!sample) return;
      outcomes.set(sample.id, await runner.run(sample));
      done += 1;
      onProgress?.(done, samples.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return new Map(
    samples.flatMap((sample) => {
      const outcome = outcomes.get(sample.id);
      return outcome ? ([[sample.id, outcome]] as const) : [];
    }),
  );
}
