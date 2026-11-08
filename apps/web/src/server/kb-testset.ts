import {
  runTestSet,
  runTryPipeline,
  type TestCaseResult,
  type TestSetSummary,
  type TryDeps,
  type TryQuota,
} from '@flow/ai';
import { parseTestSetText } from '../lib/kb-testset-form';
import {
  type KnowledgeRunner,
  NoKnowledgeError,
  type TryKnowledgeSource,
  type TrySession,
} from './try-ai-knowledge';
import type { TryLlmDeps } from './try-ai-llm';

/**
 * Chạy bộ câu kiểm thử (FR-054, US-034) qua pipeline Thử AI bằng LLM THẬT và kiến thức THẬT của workspace (dùng chung
 * `KnowledgeRunner`; thiếu LLM → `llm_not_configured`, chưa có kiến thức → `no_knowledge`; KHÔNG chạy bản mẫu — chủ dự án chốt 08/11). Không trừ lượt gói (BR-03), không ghi dữ liệu. Hạn mức riêng: số LẦN CHẠY
 * mỗi ngày mỗi workspace (mỗi lần tối đa 20 ca). Đầu vào sai không tốn hạn mức. Log chỉ có tên lỗi.
 */
export type KbTestSetFailure =
  | 'empty'
  | 'too_many'
  | 'invalid_line'
  | 'limit_reached'
  | 'llm_not_configured'
  | 'no_knowledge'
  | 'unavailable';

export type KbTestSetResult =
  | {
      ok: true;
      results: TestCaseResult[];
      summary: TestSetSummary;
      quota: { used: number; limit: number };
      knowledge: Exclude<TryKnowledgeSource, 'demo'>;
    }
  | { ok: false; reason: Exclude<KbTestSetFailure, 'invalid_line'> }
  | { ok: false; reason: 'invalid_line'; line: number };

export type KbTestSetDeps = {
  quota: TryQuota;
  now?: () => Date;
  buildDeps?: () => TryDeps | null;
  knowledgeRunner?: KnowledgeRunner;
  /** LLM thật (bắt buộc extractor + drafter, trừ khi test cắm `buildDeps`). */
  llm?: TryLlmDeps;
  warn?: (event: { event: string; reason?: string }) => void;
};

const EMPTY_KNOWLEDGE: TryDeps['knowledge'] = {
  matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
  lookupProductFacts: async () => [],
  searchKb: async () => [],
};

const realDeps = (llm: TryLlmDeps | undefined): TryDeps | null =>
  llm?.extractor && llm.drafter
    ? {
        extractor: llm.extractor,
        drafter: llm.drafter,
        knowledge: EMPTY_KNOWLEDGE,
        ...(llm.rewriter ? { rewriter: llm.rewriter } : {}),
      }
    : null;

const DEMO_VOICE = { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' } as const;

export function createKbTestSetAction(deps: KbTestSetDeps) {
  const now = deps.now ?? (() => new Date());
  const build = deps.buildDeps ?? (() => realDeps(deps.llm));
  const warn = deps.warn ?? ((event) => console.error(JSON.stringify(event)));

  return async function kbTestSetAction(
    session: TrySession,
    rawText: unknown,
  ): Promise<KbTestSetResult> {
    const parsed = parseTestSetText(rawText);
    if (!parsed.ok) return parsed;

    const built = build();
    if (!built) return { ok: false, reason: 'llm_not_configured' };
    if (!deps.knowledgeRunner) return { ok: false, reason: 'no_knowledge' };

    const taken = deps.quota.take(session.workspaceId, now());
    if (!taken.ok) return { ok: false, reason: 'limit_reached' };

    try {
      const runAll = (knowledge: TryDeps['knowledge']) =>
        runTestSet(parsed.cases, (text) =>
          runTryPipeline(
            {
              workspaceId: session.workspaceId,
              text,
              kbVersion: 'demo',
              voice: { ...DEMO_VOICE, do: [], dont: [] },
              autoSendEnabled: true,
            },
            { ...built, knowledge },
          ),
        );
      const { value, source } = await deps.knowledgeRunner(session, built.knowledge, runAll);
      return {
        ok: true,
        results: value.results,
        summary: value.summary,
        quota: { used: taken.used, limit: taken.limit },
        knowledge: source,
      };
    } catch (error) {
      if (error instanceof NoKnowledgeError) return { ok: false, reason: 'no_knowledge' };
      warn({ event: 'kb_testset_failed', reason: error instanceof Error ? error.name : 'unknown' });
      return { ok: false, reason: 'unavailable' };
    }
  };
}
