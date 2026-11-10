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
  /** Chế độ chỗ giữ chỗ (cờ `fact_slots`); thiếu/false → chỉ dùng plan cho phần không phụ thuộc cờ. */
  factSlotsMode?: boolean;
  /** Ngôn ngữ trả lời mặc định của shop (câu ngắn). */
  replyLanguage?: 'vi' | 'en';
  workspaceId?: string;
  /** Dựng các bước cho MỘT mẫu; mọi lần gọi LLM phải được ghi vào `sink` (qua `recordUsage`). */
  build: (sink: UsageRecord[]) => PipelineParts;
};

export type ExtractSnapshot = {
  product_mentions: string[];
  /** Bản CUỐI pipeline dùng (đã bổ sung bằng code từ giá trị biến thể khi extract bỏ sót). */
  size: string | null;
  color: string | null;
  /** Bản THÔ của LLM (theo dõi chất lượng extract, không phải cổng). */
  sizeRaw?: string | null;
  colorRaw?: string | null;
  qty: number | null;
  /** Các ý hỏi model tách ra (chẩn đoán chủ đề). */
  asks: string[];
  /** Chủ đề sự kiện extract trả (enum) và nơi giao khách nêu — để chẩn đoán lệch hành động. */
  topics: string[];
  destination: string | null;
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
      /** Quyết định cần người (decision.needsHuman), chính sách tự gửi, và lý do rủi ro/duyệt — để rà mẫu "cần người". */
      needsHuman: boolean;
      autoSendPolicy: string;
      riskReasons: Record<string, string[] | undefined>;
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
        /** TOÀN BỘ đoạn tìm được (`found`), kể cả đoạn không được dùng — để tách lỗi oan (nguồn có nêu ở đoạn khác) khỏi lỗi thật. */
        found: Array<{ id: string; kind: string; topics: string[]; text: string; used: boolean }>;
        /** Dấu vết guard khái niệm: khái niệm bị bắt, câu nháp gốc, nguồn đã dùng (chỉ quan sát). */
        guardTrace?: { concept?: { concepts: string[]; draftReply: string; usedIds: string[] } };
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
          sizeRaw: result.size,
          colorRaw: result.color,
          qty: result.qty,
          asks: [...result.asks],
          topics: [...result.topics],
          destination: result.destination,
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
      ...(context.replyLanguage ? { replyLanguage: context.replyLanguage } : {}),
      ...(context.factSlots ? { factSlots: context.factSlots } : {}),
      ...(context.factSlotsMode ? { factSlotsMode: true } : {}),
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
    // size/màu CUỐI CÙNG pipeline dùng (đã bổ sung bằng code từ giá trị biến thể khi extract bỏ sót): ảnh chụp phản ánh đúng thứ quyết định/soạn câu dựa vào.
    if (snapshot) {
      snapshot = {
        ...(snapshot as ExtractSnapshot),
        size: result.extract.size,
        color: result.extract.color,
      };
    }
    return {
      ok: true,
      id: sample.id,
      label: result.label,
      action: result.decision.action,
      reason: result.decision.reason,
      unansweredTopics: [...result.decision.unansweredTopics],
      needsHuman: result.decision.needsHuman,
      autoSendPolicy: result.decision.autoSendPolicy,
      riskReasons: result.riskReasons,
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
        found: result.candidates.map((c) => ({
          id: c.id,
          kind: c.kind,
          topics: [...c.topics],
          text: String(c.text),
          used: c.used,
        })),
        ...(result.guardTrace ? { guardTrace: result.guardTrace } : {}),
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
