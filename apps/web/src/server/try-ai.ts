import {
  createDemoDrafter,
  createDemoExtractor,
  createDemoKnowledge,
  runTryPipeline,
  type TryDeps,
  type TryQuota,
  type TryResult,
} from '@flow/ai';
import { z } from 'zod';
import { TRY_AI_MAX_CHARS } from '../lib/try-ai-limits';
import type { KnowledgeRunner, TryKnowledgeSource, TrySession } from './try-ai-knowledge';

/**
 * Logic của hành động "Thử AI" (FR-059, FR-029, US-034), tách khỏi Server Action để test với phụ thuộc được tiêm.
 * Chạy cả pipeline bằng MOCK (Q-ATB1; đường LLM/KB thật chờ `TRY-AI-REAL`), KHÔNG trừ lượt gói (BR-03) — chỉ có
 * giới hạn lượt thử/ngày. Đầu vào sai không tốn lượt thử. Log chỉ có tên sự kiện/lỗi, không nội dung bình luận.
 */
export { TRY_AI_MAX_CHARS };

export type TryAiFailure = 'empty' | 'too_long' | 'limit_reached' | 'unavailable';

export type TryAiResult =
  | {
      ok: true;
      result: TryResult;
      quota: { used: number; limit: number };
      /** Nguồn kiến thức đã dùng: mẫu hay KB thật (cờ `TRY_AI_KB_REAL`). */
      knowledge: TryKnowledgeSource;
    }
  | { ok: false; reason: TryAiFailure };

export type TryAiDeps = {
  quota: TryQuota;
  now?: () => Date;
  buildDeps?: () => TryDeps;
  /** Chọn nguồn kiến thức (mặc định: mẫu). Bản KB thật chạy trong giao dịch `withActor`. */
  knowledgeRunner?: KnowledgeRunner;
  warn?: (event: { event: string; reason?: string }) => void;
};

const textSchema = z.string().trim().min(1);

const defaultDeps = (): TryDeps => ({
  extractor: createDemoExtractor(),
  drafter: createDemoDrafter(),
  knowledge: createDemoKnowledge(),
});

/** Giọng văn mẫu của ô thử (chưa đọc `brand_voice` thật của workspace — KB-SHOP-POLICY-FAQ có bảng, chưa nối). */
const DEMO_VOICE = {
  do: [],
  dont: [],
  shopPronoun: 'shop',
  customerAddress: 'ban',
} as const;

export function createTryAiAction(deps: TryAiDeps) {
  const now = deps.now ?? (() => new Date());
  const build = deps.buildDeps ?? defaultDeps;
  const warn = deps.warn ?? ((event) => console.error(JSON.stringify(event)));

  return async function tryAiAction(session: TrySession, rawText: unknown): Promise<TryAiResult> {
    const parsed = textSchema.safeParse(rawText);
    if (!parsed.success) return { ok: false, reason: 'empty' };
    if (parsed.data.length > TRY_AI_MAX_CHARS) return { ok: false, reason: 'too_long' };

    const taken = deps.quota.take(session.workspaceId, now());
    if (!taken.ok) return { ok: false, reason: 'limit_reached' };

    try {
      const built = build();
      const input = {
        workspaceId: session.workspaceId,
        text: parsed.data,
        kbVersion: 'demo',
        voice: { ...DEMO_VOICE, do: [], dont: [] },
        // Ô thử cho biết kết quả "nếu Owner bật tự gửi"; cổng thật chưa có (AUTO-SEND-GATE).
        autoSendEnabled: true,
      };
      const runPipeline = (knowledge: TryDeps['knowledge']) =>
        runTryPipeline(input, { ...built, knowledge });
      const { value, source } = deps.knowledgeRunner
        ? await deps.knowledgeRunner(session, built.knowledge, runPipeline)
        : { value: await runPipeline(built.knowledge), source: 'demo' as const };
      return {
        ok: true,
        result: value,
        quota: { used: taken.used, limit: taken.limit },
        knowledge: source,
      };
    } catch (error) {
      warn({ event: 'try_ai_failed', reason: error instanceof Error ? error.name : 'unknown' });
      return { ok: false, reason: 'unavailable' };
    }
  };
}
