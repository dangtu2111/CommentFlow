import type { DraftVoice } from '@flow/ai';
import {
  type AbbreviationDict,
  type ConversationState,
  type Drafter,
  type Extractor,
  isUnreadableAiOutput,
  type PipelineInput,
  type Rewriter,
  requiredFactIds,
  runTryPipeline,
  type SlotDiagnostics,
  type TryKnowledge,
} from '@flow/ai';
import { isAppError, type MaskedText, maskPii } from '@flow/shared';
import type { EvalSample } from './dataset';
import type { UsageRecord } from './recording-llm';

/**
 * Chạy MỘT mẫu qua pipeline thật của ô Thử AI (`runTryPipeline`: che PII → chuẩn hóa → extract → rewrite → route → tìm nguồn
 * → decideAction → draft → guard → độ tin cậy), bắt lại kết quả `extract` và các lần gọi LLM. Không bao giờ ném lỗi ra ngoài:
 * lỗi của AI thành `ok: false` kèm MÃ (không có nội dung khách hay đầu ra thô).
 */
export type PipelineParts = {
  extractor: Extractor;
  drafter: Drafter;
  rewriter?: Rewriter;
};

export type RunContext = {
  knowledge: TryKnowledge;
  voice: DraftVoice;
  dict?: AbbreviationDict;
  variantCount?: number;
  /** Đường fact plan (ADR 017): chính sách đã duyệt + chế độ tồn kho; thiếu → đường cũ. */
  factSlots?: PipelineInput['factSlots'];
  workspaceId?: string;
  /** Dựng các bước cho MỘT mẫu; mọi lần gọi LLM phải được ghi vào `sink` (qua `recordUsage`). */
  build: (sink: UsageRecord[]) => PipelineParts;
};

export type ExtractSnapshot = {
  product_mentions: string[];
  size: string | null;
  color: string | null;
  qty: number | null;
  /** Các ý hỏi model tách ra (chẩn đoán chủ đề). */
  asks: string[];
};

export type SampleOutcome =
  | {
      ok: true;
      id: string;
      label: string;
      action: string;
      /** Lý do `decideAction` (chẩn đoán lệch hành động). */
      reason: string;
      unansweredTopics: string[];
      lang: string;
      reply: string;
      variants: string[];
      confidence: number;
      /** Số vi phạm số tiền/%/ngày/SĐT/link lạ (guard-money): ≥ 1 = câu có số không có trong nguồn. */
      moneyViolations: number;
      /** Mã vi phạm của guard §4 (nguồn từng ý, ngôn ngữ, độ dài, xưng hô). */
      replyViolations: string[];
      extract: ExtractSnapshot | null;
      /** Câu tìm kiếm đã dùng + nguồn (rule/llm/không chạy rewrite). */
      searchQuery: string;
      rewriteSource: 'rule' | 'llm' | null;
      /** Chẩn đoán lỗi số/nguồn: các nguồn bộ soạn ĐÃ DÙNG (id + văn bản), từng ý (claim) kèm `source_ids`, và vi phạm guard tiền (mã + giá trị). */
      diagnostics?: {
        usedSources: Array<{ id: string; text: string }>;
        claims: Array<{ text: string; sourceIds: string[] }>;
        moneyViolations: unknown[];
      };
      /** Chẩn đoán đường fact plan (chỉ khi bật `--fact-slots`). */
      slot?: SlotOutcome;
      usage: UsageRecord[];
    }
  | {
      ok: false;
      id: string;
      /** `skipped` = bị lọc quy tắc; `invalid_output` = AI trả JSON hỏng; `limit` = chạm trần chi phí/lần gọi; `error` = khác. */
      errorKind: 'skipped' | 'invalid_output' | 'limit' | 'error';
      /** Mã + thông báo CHUNG của lỗi (ví dụ `LLM_UNAVAILABLE: Dịch vụ AI trả về lỗi HTTP 400.`); không có nội dung khách. */
      detail?: string;
      usage: UsageRecord[];
    };

export type SlotOutcome = {
  diagnostics: SlotDiagnostics | null;
  required: number;
  known: number;
  unknown: number;
  clarify: boolean;
};

const WORKSPACE = '00000000-0000-4000-8000-000000000e01';

type ConvoTurnInput = { from: 'customer' | 'shop'; text: MaskedText; at: Date };

function convoOf(turns: readonly ConvoTurnInput[], state: ConversationState | null) {
  return {
    context: { turns: [...turns], otherQuestions: [] },
    postProductIds: [] as string[],
    postProductNames: [] as string[],
    state,
  };
}

export async function runSample(sample: EvalSample, context: RunContext): Promise<SampleOutcome> {
  const usage: UsageRecord[] = [];
  let snapshot: ExtractSnapshot | null = null;
  try {
    const parts = context.build(usage);
    const extractor: Extractor = {
      async extract(input) {
        const result = await parts.extractor.extract(input);
        snapshot = {
          product_mentions: result.product_mentions,
          size: result.size,
          color: result.color,
          qty: result.qty,
          asks: [...result.asks],
        };
        return result;
      },
    };
    const pipelineDeps = {
      extractor,
      drafter: parts.drafter,
      knowledge: context.knowledge,
      ...(parts.rewriter ? { rewriter: parts.rewriter } : {}),
    };
    const baseInput = {
      workspaceId: context.workspaceId ?? WORKSPACE,
      kbVersion: 'eval',
      voice: context.voice,
      autoSendEnabled: true,
      ...(context.factSlots ? { factSlots: context.factSlots } : {}),
      ...(context.dict ? { dict: context.dict } : {}),
      ...(context.variantCount === undefined ? {} : { variantCount: context.variantCount }),
    };
    // Mẫu nhiều lượt: phát lại các lượt KHÁCH trước (theo thứ tự) để có trạng thái hội thoại thật, rồi chạy lượt cuối với lịch sử.
    const thread = sample.thread ?? [];
    const turns: ConvoTurnInput[] = [];
    let state: ConversationState | null = null;
    for (const turn of thread) {
      if (turn.from === 'customer') {
        const prior = await runTryPipeline(
          { ...baseInput, text: turn.text, convo: convoOf(turns, state) },
          pipelineDeps,
        );
        if (prior.status === 'done') state = prior.conversationState;
      }
      turns.push({
        from: turn.from,
        text: maskPii(turn.text),
        at: new Date(turns.length * 60_000),
      });
    }
    snapshot = null; // ảnh chụp chỉ của lượt CUỐI (đáp án đúng gắn với lượt cuối)
    const result = await runTryPipeline(
      {
        ...baseInput,
        text: sample.text,
        ...(thread.length > 0 ? { convo: convoOf(turns, state) } : {}),
      },
      pipelineDeps,
    );
    if (result.status !== 'done') return { ok: false, id: sample.id, errorKind: 'skipped', usage };
    return {
      ok: true,
      id: sample.id,
      label: result.label,
      action: result.decision.action,
      reason: result.decision.reason,
      unansweredTopics: [...result.decision.unansweredTopics],
      lang: result.draft.lang,
      reply: result.reply,
      variants: result.variants,
      confidence: result.confidence.confidence,
      moneyViolations: result.guard.violations.length,
      replyViolations: result.guard.replyViolations.map((violation) => violation.code),
      extract: snapshot,
      searchQuery: result.searchQuery ?? '',
      rewriteSource: result.rewriteSource ?? null,
      diagnostics: {
        usedSources: result.candidates
          .filter((c) => c.used)
          .map((c) => ({ id: c.id, text: String(c.text) })),
        claims: result.draft.claims.map((c) => ({ text: c.text, sourceIds: c.source_ids })),
        moneyViolations: result.guard.violations,
      },
      ...(result.factPlan
        ? {
            slot: {
              diagnostics: result.slotDiagnostics ?? null,
              required: requiredFactIds(result.factPlan).length,
              known: result.factPlan.facts.filter((f) => f.status === 'known').length,
              unknown: result.factPlan.facts.filter((f) => f.status !== 'known').length,
              clarify: Boolean(result.factPlan.clarify),
            },
          }
        : {}),
      usage,
    };
  } catch (error) {
    // `LlmClient` bọc lỗi mạng thành AppError, chỉ giữ TÊN lỗi gốc trong `cause.message`: nhận ra trần chi phí qua đó.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
    const name = error instanceof Error ? error.name : '';
    const errorKind = isUnreadableAiOutput(error)
      ? 'invalid_output'
      : name === 'SpendLimitError' || cause === 'SpendLimitError'
        ? 'limit'
        : 'error';
    const detail = isAppError(error) ? `${error.code}: ${error.message}` : name;
    return { ok: false, id: sample.id, errorKind, detail, usage };
  }
}
