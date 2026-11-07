import {
  createAbbreviationDict,
  createDemoDrafter,
  createDemoExtractor,
  createDemoKnowledge,
  DEMO_ABBREVIATIONS,
  type EmbeddingConsistency,
  isUnreadableAiOutput,
  type PipelineConvoInput,
  runTryPipeline,
  type TryDeps,
  type TryQuota,
  type TryResult,
} from '@flow/ai';
import { z } from 'zod';
import { TRY_AI_MAX_CHARS } from '../lib/try-ai-limits';
import {
  EMBEDDING_OFF,
  type KnowledgeRunner,
  type TryKnowledgeSource,
  type TryRunContext,
  type TrySession,
} from './try-ai-knowledge';
import type { TryLlmDeps } from './try-ai-llm';
import { type PreviousTurn, parsePreviousTurns } from './try-ai-previous';

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
      /** Model embedding so với dữ liệu (FR-133): `mismatch` → nhánh vector đã TẮT, giao diện báo "chạy kb:reembed". */
      embedding: EmbeddingConsistency;
      /** Giọng văn đã dùng: `shop` = `brand_voice` thật của workspace (có cho ngôn ngữ nhận ra), `demo` = giọng mẫu. */
      voice: 'shop' | 'demo';
      /** Bước nào đang chạy bằng LLM thật (cờ `*_LLM_ENABLED` + LiteLLM); còn lại là bản mẫu. */
      llm: { extractor: boolean; drafter: boolean; rewriter: boolean };
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

function previousConvo(turns: readonly PreviousTurn[]): PipelineConvoInput {
  return {
    context: { turns: [...turns], otherQuestions: [] },
    postProductIds: [],
    postProductNames: [],
    state: null,
  };
}

const defaultDeps = (llm: TryLlmDeps = {}): TryDeps => ({
  extractor: llm.extractor ?? createDemoExtractor(),
  drafter: llm.drafter ?? createDemoDrafter(),
  knowledge: createDemoKnowledge(),
  ...(llm.rewriter ? { rewriter: llm.rewriter } : {}),
});

/** Giọng văn MẪU của ô thử — dùng khi workspace chưa có `brand_voice` hợp lệ cho ngôn ngữ nhận ra (có thì dùng giọng thật qua `voices`). */
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

  return async function tryAiAction(
    session: TrySession,
    rawText: unknown,
    rawPrevious?: unknown,
  ): Promise<TryAiResult> {
    const parsed = textSchema.safeParse(rawText);
    if (!parsed.success) return { ok: false, reason: 'empty' };
    if (parsed.data.length > TRY_AI_MAX_CHARS) return { ok: false, reason: 'too_long' };

    const taken = deps.quota.take(session.workspaceId, now());
    if (!taken.ok) return { ok: false, reason: 'limit_reached' };

    const previous = parsePreviousTurns(rawPrevious);
    try {
      const built = build();
      const input = {
        workspaceId: session.workspaceId,
        text: parsed.data,
        kbVersion: 'demo',
        voice: { ...DEMO_VOICE, do: [], dont: [] },
        // Ô thử cho biết kết quả "nếu Owner bật tự gửi"; cổng thật chưa có (AUTO-SEND-GATE).
        autoSendEnabled: true,
        // "Lượt trước" tùy chọn (Q-POR12 điểm 5): lịch sử đã che PII cho extract/rewrite/soạn câu; Thử AI không phát lại để lấy trạng thái.
        ...(previous.length > 0 ? { convo: previousConvo(previous) } : {}),
      };
      let voiceSource: 'shop' | 'demo' = 'demo';
      const runPipeline = async (knowledge: TryDeps['knowledge'], context?: TryRunContext) => {
        const result = await runTryPipeline(
          {
            ...input,
            ...(context && Object.keys(context.voices).length > 0
              ? { voices: context.voices }
              : {}),
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
        // `shop` chỉ khi giọng thật CÓ cho đúng ngôn ngữ mà pipeline nhận ra (nếu không, bộ soạn dùng giọng mẫu).
        if (result.status === 'done' && result.lang !== 'other' && context?.voices[result.lang]) {
          voiceSource = 'shop';
        }
        return result;
      };
      const { value, source, embedding } = deps.knowledgeRunner
        ? await deps.knowledgeRunner(session, built.knowledge, runPipeline)
        : {
            value: await runPipeline(built.knowledge),
            source: 'demo' as const,
            embedding: EMBEDDING_OFF,
          };
      return {
        ok: true,
        result: value,
        quota: { used: taken.used, limit: taken.limit },
        knowledge: source,
        embedding,
        voice: voiceSource,
        llm: {
          extractor: Boolean(deps.llm?.extractor),
          drafter: Boolean(deps.llm?.drafter),
          rewriter: Boolean(deps.llm?.rewriter),
        },
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
