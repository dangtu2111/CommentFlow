import {
  createAbbreviationDict,
  createDemoDrafter,
  createDemoExtractor,
  createDemoKnowledge,
  DEMO_ABBREVIATIONS,
  isUnreadableAiOutput,
  runTryPipeline,
  type TryDeps,
  type TryQuota,
  type TryResult,
} from '@flow/ai';
import { z } from 'zod';
import { TRY_AI_MAX_CHARS } from '../lib/try-ai-limits';
import type {
  KnowledgeRunner,
  TryKnowledgeSource,
  TryRunContext,
  TrySession,
} from './try-ai-knowledge';
import type { TryLlmDeps } from './try-ai-llm';

/**
 * Logic của hành động "Thử AI" (FR-059, FR-029, US-034), tách khỏi Server Action để test với phụ thuộc được tiêm.
 * Chạy cả pipeline bằng MOCK (Q-ATB1; đường LLM/KB thật chờ `TRY-AI-REAL`), KHÔNG trừ lượt gói (BR-03) — chỉ có
 * giới hạn lượt thử/ngày. Đầu vào sai không tốn lượt thử. Log chỉ có tên sự kiện/lỗi, không nội dung bình luận.
 */
export { TRY_AI_MAX_CHARS };

export type TryAiFailure =
  | 'empty'
  | 'too_long'
  | 'limit_reached'
  | 'unavailable'
  /** AI trả đầu ra không đọc được/sai schema → chuyển người (FR-032), khác lỗi mạng/khóa. */
  | 'ai_invalid_output';

export type TryAiResult =
  | {
      ok: true;
      result: TryResult;
      quota: { used: number; limit: number };
      /** Nguồn kiến thức đã dùng: mẫu hay KB thật (cờ `TRY_AI_KB_REAL`). */
      knowledge: TryKnowledgeSource;
      /** Bước nào đang chạy bằng LLM thật (cờ `*_LLM_ENABLED` + LiteLLM); còn lại là bản mẫu. */
      llm: { extractor: boolean; drafter: boolean };
    }
  | { ok: false; reason: TryAiFailure };

export type TryAiDeps = {
  quota: TryQuota;
  now?: () => Date;
  buildDeps?: () => TryDeps;
  /** Chọn nguồn kiến thức (mặc định: mẫu). Bản KB thật chạy trong giao dịch `withActor`. */
  knowledgeRunner?: KnowledgeRunner;
  /** LLM thật cho từng bước (TRY-AI-REAL lát C); thiếu bước nào thì bước đó dùng bản mẫu. */
  llm?: TryLlmDeps;
  warn?: (event: { event: string; reason?: string }) => void;
};

const textSchema = z.string().trim().min(1);

const defaultDeps = (llm: TryLlmDeps = {}): TryDeps => ({
  extractor: llm.extractor ?? createDemoExtractor(),
  drafter: llm.drafter ?? createDemoDrafter(),
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
  const build = deps.buildDeps ?? (() => defaultDeps(deps.llm));
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
      const runPipeline = (knowledge: TryDeps['knowledge'], context?: TryRunContext) =>
        runTryPipeline(
          {
            ...input,
            // Từ điển thật (hệ thống + workspace) khi có DB; không thì bản mẫu — để "bn"/"sz" được mở trước khi extract.
            dict: createAbbreviationDict(
              context && Object.keys(context.abbreviations).length > 0
                ? context.abbreviations
                : DEMO_ABBREVIATIONS,
            ),
          },
          {
            ...built,
            knowledge,
            // Có sản phẩm thật → bộ nhận diện mẫu nhận ra đúng tên sản phẩm của shop (thay danh sách mẫu cố định).
            extractor:
              context && context.productNames.length > 0 && !deps.buildDeps && !deps.llm?.extractor
                ? createDemoExtractor({ productNames: context.productNames })
                : built.extractor,
          },
        );
      const { value, source } = deps.knowledgeRunner
        ? await deps.knowledgeRunner(session, built.knowledge, runPipeline)
        : { value: await runPipeline(built.knowledge), source: 'demo' as const };
      return {
        ok: true,
        result: value,
        quota: { used: taken.used, limit: taken.limit },
        knowledge: source,
        llm: { extractor: Boolean(deps.llm?.extractor), drafter: Boolean(deps.llm?.drafter) },
      };
    } catch (error) {
      if (isUnreadableAiOutput(error)) {
        warn({ event: 'try_ai_invalid_output' });
        return { ok: false, reason: 'ai_invalid_output' };
      }
      warn({ event: 'try_ai_failed', reason: error instanceof Error ? error.name : 'unknown' });
      return { ok: false, reason: 'unavailable' };
    }
  };
}
