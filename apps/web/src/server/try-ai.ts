import {
  createAbbreviationDict,
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
  type KnowledgeRunner,
  NoKnowledgeError,
  type TryKnowledgeSource,
  type TryRunContext,
  type TrySession,
  type VectorStatus,
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
  /** Chưa cấu hình LLM thật (cờ DB `cf.ai.classify`/`cf.ai.draft` + LiteLLM + tên model): KHÔNG chạy bản mẫu (chủ dự án chốt 08/11). */
  | 'llm_missing_service'
  | 'llm_missing_model'
  | 'llm_flag_off'
  /** Workspace chưa có kiến thức/sản phẩm thật để thử. */
  | 'no_knowledge'
  /** AI trả đầu ra không đọc được/sai schema → chuyển người (FR-032), khác lỗi mạng/khóa. */
  | 'ai_invalid_output';

export type TryAiResult =
  | {
      ok: true;
      result: TryResult;
      quota: { used: number; limit: number };
      /** Nguồn kiến thức đã dùng: mẫu hay KB thật (cờ `TRY_AI_KB_REAL`). */
      knowledge: Exclude<TryKnowledgeSource, 'demo'>;
      /** Model embedding so với dữ liệu (FR-133): `mismatch` → nhánh vector đã TẮT, giao diện báo "chạy kb:reembed". */
      embedding: EmbeddingConsistency;
      /** Vì sao không có nhánh vector (cấu hình/DB) và dịch vụ embedding có lỗi giữa lượt không — giao diện báo sự cố, không im lặng. */
      vector: VectorStatus;
      /** Giọng văn đã dùng: `shop` = `brand_voice` thật của workspace (có cho ngôn ngữ nhận ra), `demo` = giọng mẫu. */
      voice: 'shop' | 'demo';
      /** Bước nào đang chạy bằng LLM thật (cờ DB `cf.ai.*` + LiteLLM); còn lại là bản mẫu. */
      llm: { extractor: boolean; drafter: boolean; rewriter: boolean };
    }
  | { ok: false; reason: TryAiFailure };

export type TryAiDeps = {
  quota: TryQuota;
  now?: () => Date;
  buildDeps?: () => TryDeps;
  /** Nguồn kiến thức THẬT của workspace (bản DB chạy trong giao dịch `withActor`). Thiếu → `no_knowledge`; KHÔNG có kiến thức mẫu. */
  knowledgeRunner?: KnowledgeRunner;
  /** LLM thật cho extract + soạn câu (bắt buộc cả hai, trừ khi test cắm `buildDeps`). Thiếu → `llm_*`; KHÔNG có bản mẫu. */
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

/** Nguồn rỗng: chỉ để dựng `TryDeps` — nguồn thật luôn đến từ `knowledgeRunner` (thiếu thì lượt dừng ở `no_knowledge`). */
const EMPTY_KNOWLEDGE: TryDeps['knowledge'] = {
  matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
  lookupProductFacts: async () => [],
  searchKb: async () => [],
};

function realDeps(llm: TryLlmDeps | undefined): TryDeps | null {
  if (!llm?.extractor || !llm.drafter) return null;
  return {
    extractor: llm.extractor,
    drafter: llm.drafter,
    knowledge: EMPTY_KNOWLEDGE,
    ...(llm.rewriter ? { rewriter: llm.rewriter } : {}),
  };
}

/** Giọng văn MẪU của ô thử — dùng khi workspace chưa có `brand_voice` hợp lệ cho ngôn ngữ nhận ra (có thì dùng giọng thật qua `voices`). */
const DEMO_VOICE = {
  do: [],
  dont: [],
  shopPronoun: 'shop',
  customerAddress: 'ban',
} as const;

export function createTryAiAction(deps: TryAiDeps) {
  const now = deps.now ?? (() => new Date());
  const build = deps.buildDeps ?? (() => realDeps(deps.llm));
  const warn = deps.warn ?? ((event) => console.error(JSON.stringify(event)));

  return async function tryAiAction(
    session: TrySession,
    rawText: unknown,
    rawPrevious?: unknown,
  ): Promise<TryAiResult> {
    const parsed = textSchema.safeParse(rawText);
    if (!parsed.success) return { ok: false, reason: 'empty' };
    if (parsed.data.length > TRY_AI_MAX_CHARS) return { ok: false, reason: 'too_long' };

    // Thiếu LLM thật hoặc nguồn kiến thức thật → báo rõ TRƯỚC khi tốn lượt (không chạy bản mẫu).
    // Nêu ĐÚNG nguyên nhân AI chưa chạy được: thiếu dịch vụ LiteLLM / thiếu tên model / cờ DB cf.ai.* tắt cho workspace — kiểm trước khi tốn lượt.
    const notReady = deps.llm?.diagnose ? await deps.llm.diagnose(session.workspaceId) : null;
    if (notReady) return { ok: false, reason: `llm_${notReady}` };
    const built = build();
    if (!built) return { ok: false, reason: 'llm_missing_service' };
    if (!deps.knowledgeRunner) return { ok: false, reason: 'no_knowledge' };

    const taken = deps.quota.take(session.workspaceId, now());
    if (!taken.ok) return { ok: false, reason: 'limit_reached' };

    const previous = parsePreviousTurns(rawPrevious);
    try {
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
            dict: createAbbreviationDict(context?.abbreviations ?? {}),
          },
          {
            ...built,
            knowledge,
          },
        );
        // `shop` chỉ khi giọng thật CÓ cho đúng ngôn ngữ mà pipeline nhận ra (nếu không, bộ soạn dùng giọng mẫu).
        if (result.status === 'done' && result.lang !== 'other' && context?.voices[result.lang]) {
          voiceSource = 'shop';
        }
        return result;
      };
      const { value, source, embedding, vector } = await deps.knowledgeRunner(
        session,
        built.knowledge,
        runPipeline,
      );
      return {
        ok: true,
        result: value,
        quota: { used: taken.used, limit: taken.limit },
        knowledge: source,
        embedding,
        vector,
        voice: voiceSource,
        llm: {
          extractor: Boolean(deps.llm?.extractor),
          drafter: Boolean(deps.llm?.drafter),
          rewriter: Boolean(deps.llm?.rewriter),
        },
      };
    } catch (error) {
      if (error instanceof NoKnowledgeError) return { ok: false, reason: 'no_knowledge' };
      if (isUnreadableAiOutput(error)) {
        warn({ event: 'try_ai_invalid_output' });
        return { ok: false, reason: 'ai_invalid_output' };
      }
      warn({ event: 'try_ai_failed', reason: error instanceof Error ? error.name : 'unknown' });
      return { ok: false, reason: 'unavailable' };
    }
  };
}
