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
  type TryKnowledge,
} from '@flow/ai';
import type { EvalSample } from './dataset';
import { noopUsageDb, recordUsage } from './recording-llm';
import { type PipelineParts, runSample, type SampleOutcome } from './run-sample';
import { buildShopKnowledge, type ShopFixture, shopVoice } from './shop';
import type { TrigramScorer } from './shop-trigram';

/**
 * Dựng bộ chạy theo backend:
 *  - `litellm`: gọi qua LiteLLM (đúng thiết kế, trần chi phí do `max_budget` của khóa ảo; chi phí lấy từ header LiteLLM);
 *  - `mock`: bản mô phỏng theo từ khóa của ô Thử AI, KHÔNG gọi mạng, chi phí 0 — chỉ để thử luồng runner/promptfoo.
 * Tên model là BÍ DANH LiteLLM (`cf-classify`, `cf-draft`, hoặc `cand-*`): đổi model không sửa code.
 */
export type Backend = 'litellm' | 'mock';

export type RunnerOptions = {
  backend: Backend;
  env: Record<string, string | undefined>;
  models: { classify: string; rewrite: string; draft: string };
  /** Số cách diễn đạt KHÁC của câu soạn (0–4); 4 = 5 phiên bản, 2 = 3 phiên bản. */
  variantCount?: number;
  shop: ShopFixture;
  /** Kiến thức dựng sẵn (đường production: `createProductionKnowledge`); thiếu → dựng từ shop file như cũ. */
  knowledge?: TryKnowledge;
  /** Đường fact plan (ADR 017): chính sách đã duyệt + chế độ tồn; thiếu → đường cũ. */
  factSlots?: NonNullable<Parameters<typeof runSample>[1]['factSlots']>;
  /** Hạt giống cố định cho bước extract (cùng nhiệt độ 0) để các lượt đo ít dao động. */
  seed?: number;
  /** Thử nghiệm bước soạn: nhiệt độ khác mặc định và/hoặc seed cố định (đo xen kẽ trước/sau); thiếu → như production. */
  draft?: { temperature?: number; seed?: number };
  /** Bộ chấm điểm pg_trgm: có → khớp sản phẩm ĐÚNG như production (khuyến nghị khi đo thật); thiếu → khớp "tên chứa lời nhắc" cũ. */
  scorer?: TrigramScorer;
  /** Ghi `ai_usage` thật (chỉ backend `litellm`): `db` của dev + workspace dành cho đánh giá. Không có → không ghi DB. */
  persistUsage?: { db: unknown; workspaceId: string };
};

export type Runner = {
  run: (sample: EvalSample) => Promise<SampleOutcome>;
};

function requireEnv(env: RunnerOptions['env'], name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường ${name}.`);
  return value;
}

export function createRunner(options: RunnerOptions): Runner {
  const knowledge =
    options.knowledge ??
    (options.backend === 'mock'
      ? createDemoKnowledge()
      : buildShopKnowledge(options.shop, options.scorer ? { scorer: options.scorer } : {}));
  const dict = createAbbreviationDict(DEMO_ABBREVIATIONS);
  const voice = shopVoice(options.shop);

  let client: LlmClient | null = null;
  if (options.backend === 'litellm') {
    client = createLlmClient({
      db: (options.persistUsage?.db ?? noopUsageDb) as never,
      baseUrl: requireEnv(options.env, 'LITELLM_BASE_URL'),
      apiKey: requireEnv(options.env, 'LITELLM_API_KEY'),
    });
  }

  return {
    run: (sample) =>
      runSample(sample, {
        knowledge,
        voice,
        dict,
        ...(options.factSlots ? { factSlots: options.factSlots } : {}),
        replyLanguage: options.shop.replyLanguage,
        ...(options.persistUsage ? { workspaceId: options.persistUsage.workspaceId } : {}),
        ...(options.variantCount === undefined ? {} : { variantCount: options.variantCount }),
        build: (sink): PipelineParts => {
          if (!client) return { extractor: createDemoExtractor(), drafter: createDemoDrafter() };
          const llm = recordUsage(client, sink);
          return {
            extractor: createLlmExtractor({
              llm,
              model: options.models.classify,
              ...(options.seed === undefined ? {} : { seed: options.seed }),
            }),
            rewriter: createLlmRewriter({ llm, model: options.models.rewrite }),
            drafter: createLlmDrafter({
              llm,
              model: options.models.draft,
              ...(options.draft?.temperature === undefined
                ? {}
                : { temperature: options.draft.temperature }),
              ...(options.draft?.seed === undefined ? {} : { seed: options.draft.seed }),
            }),
          };
        },
      }),
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
