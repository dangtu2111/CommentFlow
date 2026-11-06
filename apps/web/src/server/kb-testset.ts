import {
  createDemoDrafter,
  createDemoExtractor,
  createDemoKnowledge,
  runTestSet,
  runTryPipeline,
  type TestCaseResult,
  type TestSetSummary,
  type TryDeps,
  type TryQuota,
} from '@flow/ai';
import { parseTestSetText } from '../lib/kb-testset-form';
import type { KnowledgeRunner, TryKnowledgeSource, TrySession } from './try-ai-knowledge';

/**
 * Chạy bộ câu kiểm thử (FR-054, US-034) qua pipeline Thử AI bằng MOCK (Q-KTS1; KB thật chỉ khi cờ `TRY_AI_KB_REAL`
 * bật, dùng chung `KnowledgeRunner`). Không trừ lượt gói (BR-03), không ghi dữ liệu. Hạn mức riêng: số LẦN CHẠY
 * mỗi ngày mỗi workspace (mỗi lần tối đa 20 ca). Đầu vào sai không tốn hạn mức. Log chỉ có tên lỗi.
 */
export type KbTestSetFailure =
  | 'empty'
  | 'too_many'
  | 'invalid_line'
  | 'limit_reached'
  | 'unavailable';

export type KbTestSetResult =
  | {
      ok: true;
      results: TestCaseResult[];
      summary: TestSetSummary;
      quota: { used: number; limit: number };
      knowledge: TryKnowledgeSource;
    }
  | { ok: false; reason: Exclude<KbTestSetFailure, 'invalid_line'> }
  | { ok: false; reason: 'invalid_line'; line: number };

export type KbTestSetDeps = {
  quota: TryQuota;
  now?: () => Date;
  buildDeps?: () => TryDeps;
  knowledgeRunner?: KnowledgeRunner;
  warn?: (event: { event: string; reason?: string }) => void;
};

const defaultDeps = (): TryDeps => ({
  extractor: createDemoExtractor(),
  drafter: createDemoDrafter(),
  knowledge: createDemoKnowledge(),
});

const DEMO_VOICE = { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' } as const;

export function createKbTestSetAction(deps: KbTestSetDeps) {
  const now = deps.now ?? (() => new Date());
  const build = deps.buildDeps ?? defaultDeps;
  const warn = deps.warn ?? ((event) => console.error(JSON.stringify(event)));

  return async function kbTestSetAction(
    session: TrySession,
    rawText: unknown,
  ): Promise<KbTestSetResult> {
    const parsed = parseTestSetText(rawText);
    if (!parsed.ok) return parsed;

    const taken = deps.quota.take(session.workspaceId, now());
    if (!taken.ok) return { ok: false, reason: 'limit_reached' };

    try {
      const built = build();
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
      const { value, source } = deps.knowledgeRunner
        ? await deps.knowledgeRunner(session, built.knowledge, runAll)
        : { value: await runAll(built.knowledge), source: 'demo' as const };
      return {
        ok: true,
        results: value.results,
        summary: value.summary,
        quota: { used: taken.used, limit: taken.limit },
        knowledge: source,
      };
    } catch (error) {
      warn({ event: 'kb_testset_failed', reason: error instanceof Error ? error.name : 'unknown' });
      return { ok: false, reason: 'unavailable' };
    }
  };
}
