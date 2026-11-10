import { createRetryThrottle } from '../lib/kb-gaps-links';
import type { TryAiFailure, TryAiResult } from './try-ai';

/**
 * "Thử lại câu này" (KB-GAPS-FROM-HANDOFF): chạy lại câu hỏi mẫu (đã che PII) của MỘT gap qua đúng đường Thử AI (cùng quota/ai_usage) để Owner thấy AI trả lời gì sau khi điền thẻ/FAQ.
 * Gap chỉ được tra TRONG workspace của Owner (RLS qua `withActor`); giới hạn 1 lần/dòng/phút. Phụ thuộc được tiêm để test không gọi LLM.
 */
type Ctx = { workspaceId: string; userId: string };
type GapRow = { id: string; sampleQuestionMasked: string };

export type GapRetryResult =
  | { ok: true; action: string; reply: string; needsHuman: boolean }
  | { ok: false; reason: 'not_found' | 'throttled' | TryAiFailure; retryAfterSec?: number };

export function createGapRetry(deps: {
  findGap: (ctx: Ctx, gapId: string) => Promise<GapRow | null>;
  tryAi: (session: { workspaceId: string; userId: string }, text: unknown) => Promise<TryAiResult>;
  throttle?: ReturnType<typeof createRetryThrottle>;
  now?: () => number;
}) {
  const throttle = deps.throttle ?? createRetryThrottle();
  const now = deps.now ?? Date.now;
  return async function retry(ctx: Ctx, gapId: string): Promise<GapRetryResult> {
    const gap = await deps.findGap(ctx, gapId);
    if (!gap) return { ok: false, reason: 'not_found' };
    const taken = throttle.take(`${ctx.workspaceId}:${gap.id}`, now());
    if (!taken.ok) return { ok: false, reason: 'throttled', retryAfterSec: taken.retryAfterSec };
    const run = await deps.tryAi(ctx, gap.sampleQuestionMasked);
    if (!run.ok) return { ok: false, reason: run.reason };
    if (run.result.status !== 'done') return { ok: false, reason: 'unavailable' };
    return {
      ok: true,
      action: run.result.decision.action,
      reply: run.result.reply,
      needsHuman: run.result.decision.needsHuman,
    };
  };
}
