import {
  createDemoDrafter,
  createDemoExtractor,
  createDemoKnowledge,
  type TryDeps,
} from '@flow/ai';
import type { KnowledgeRunner } from './try-ai-knowledge';

/**
 * CHỈ CHO TEST TỰ ĐỘNG (chủ dự án chốt 08/11: ứng dụng không chạy bản giả; test tự cắm bản giả qua tham số).
 * Không import từ mã chạy thật; `createDemo*` còn bị chốt chặn `assertMockAllowed` nếu tiến trình không phải test.
 */
export const demoBuildDeps = (): TryDeps => ({
  extractor: createDemoExtractor(),
  drafter: createDemoDrafter(),
  knowledge: createDemoKnowledge(),
});

/** Runner giả: chạy trên kiến thức mẫu `base`, nguồn `shop`, không đụng DB. */
export const demoKnowledgeRunner: KnowledgeRunner = async (_session, base, run) => ({
  value: await run(base, { productNames: [], abbreviations: {}, voices: {} }),
  source: 'shop',
  embedding: { state: 'off', configuredModel: null, mismatches: [] },
  vector: { off: 'service_disabled', failed: false },
});

export const demoWiring = { buildDeps: demoBuildDeps, knowledgeRunner: demoKnowledgeRunner };
