import { z } from 'zod';
import {
  AUTOMATION_MODES,
  type AutomationMode,
  type AutoSendDecision,
  type AutoSendInput,
  decideAutoSend,
  type GateReason,
  THRESHOLD_FLOOR,
} from './auto-send-gate';

/**
 * Tự gửi theo ngôn ngữ (FR-120, `docs/09` §6 đoạn "Song ngữ") bọc quanh `decideAutoSend` — CODE quyết định.
 *
 * Mức Tự động, ngưỡng và giới hạn/ngày tra theo (kênh, nhãn, ngôn ngữ). Lớp này CHỈ CHẶN THÊM (hold hoặc hạ
 * Tự động → Chạy thử); mọi quyết định `auto_send` vẫn do cổng gốc đưa ra. Câu hỏi lại/chuyển hướng (FR-147)
 * đi qua cùng cổng gốc (`allow_clarify`/`allow_partial`). Hàm thuần, không LLM/DB, không có đường ẩn bình luận.
 */

export const REPLY_LANGS = ['vi', 'en', 'other'] as const;
export type ReplyLang = (typeof REPLY_LANGS)[number];
/** Ngôn ngữ có thể Tự động (đã có bộ đánh giá); `other` luôn chuyển người (FR-159). */
export const AUTO_LANGS = ['vi', 'en'] as const;
export type AutoLang = (typeof AUTO_LANGS)[number];

export const LANG_CELL_SCOPES = ['all', 'vi', 'en'] as const;
export const LANG_GATE_REASONS = [
  'lang_input_unreadable',
  'lang_other',
  'reply_lang_mismatch',
] as const;

export type LangCell = { lang: (typeof LANG_CELL_SCOPES)[number]; mode: AutomationMode };

export type LangOverride = { threshold?: number; dailyCap?: number };
export type LangOverrides = Partial<Record<AutoLang, LangOverride>>;

function isAutoLang(lang: string): lang is AutoLang {
  return lang === 'vi' || lang === 'en';
}

/**
 * Ngôn ngữ câu trả lời: `other` giữ `other`; kênh cố định `vi`/`en` thắng ngôn ngữ nhận diện;
 * `auto` hoặc giá trị lạ → theo nhận diện (giá trị lạ ở đâu cũng thành `other`, thiên về chặn).
 */
export function resolveReplyLang(input: {
  detected: string;
  channelReplyLanguage: string;
}): ReplyLang {
  if (!isAutoLang(input.detected)) return 'other';
  if (input.channelReplyLanguage === 'auto') return input.detected;
  return isAutoLang(input.channelReplyLanguage) ? input.channelReplyLanguage : 'other';
}

const MODE_RANK: Readonly<Record<AutomationMode, number>> = { off: 0, shadow: 1, auto: 2 };

/** Mức chặt nhất (off < shadow < auto). */
function strictestMode(modes: readonly AutomationMode[]): AutomationMode {
  return modes.reduce((a, b) => (MODE_RANK[b] < MODE_RANK[a] ? b : a), 'auto' as AutomationMode);
}

/**
 * Mức của ô theo ngôn ngữ: ô cùng phạm vi trùng nhau → lấy mức CHẶT nhất; ô riêng thắng ô `all`;
 * không có ô → `off`; `other` → `off`.
 */
export function resolveLangLevel(cells: readonly LangCell[], lang: ReplyLang): AutomationMode {
  if (!isAutoLang(lang)) return 'off';
  const pick = (scope: LangCell['lang']) =>
    cells.filter((cell) => cell.lang === scope).map((cell) => cell.mode);
  const specific = pick(lang);
  if (specific.length > 0) return strictestMode(specific);
  const all = pick('all');
  return all.length > 0 ? strictestMode(all) : 'off';
}

/**
 * Ngưỡng + giới hạn/ngày hiệu lực của ngôn ngữ. Ghi đè theo ngôn ngữ chỉ được CHẶT thêm so với cấu hình
 * chung (ngưỡng = max, giới hạn = min); ngưỡng không bao giờ thấp hơn sàn.
 */
export function resolveLangSettings(
  base: { threshold: number; dailyCap: number | null },
  lang: ReplyLang,
  overrides: LangOverrides,
): { threshold: number; dailyCap: number | null } {
  const override = isAutoLang(lang) ? overrides[lang] : undefined;
  const threshold = Math.max(base.threshold, override?.threshold ?? 0);
  const overrideCap = override?.dailyCap;
  let dailyCap = base.dailyCap;
  if (overrideCap !== undefined) {
    dailyCap = base.dailyCap === null ? overrideCap : Math.min(base.dailyCap, overrideCap);
  }
  return {
    threshold: Math.max(Number.isFinite(threshold) ? threshold : 1, THRESHOLD_FLOOR),
    dailyCap,
  };
}

const overrideSchema = z.object({
  threshold: z.number().finite().min(0).max(1).optional(),
  dailyCap: z.number().int().min(0).optional(),
});

const langInputSchema = z.object({
  lang: z.object({
    detected: z.string(),
    channelReplyLanguage: z.string(),
    /** Ngôn ngữ của bản nháp (`draft.lang` của JSON AI). */
    draftLang: z.string(),
    /** Ngôn ngữ đã đạt bộ đánh giá (FR-120, `docs/09` §6) — chưa đạt thì không Tự động. */
    evaluatedLangs: z.array(z.string()),
  }),
  cells: z.array(z.object({ lang: z.enum(LANG_CELL_SCOPES), mode: z.enum(AUTOMATION_MODES) })),
  overrides: z.object({ vi: overrideSchema.optional(), en: overrideSchema.optional() }),
  gate: z
    .object({
      // Trần do người gọi truyền (mức kênh × nhãn); lớp ngôn ngữ chỉ được hạ thêm, không nâng.
      levels: z.object({ channelLabel: z.enum(AUTOMATION_MODES) }).loose(),
      settings: z
        .object({
          threshold: z.number().finite().min(0).max(1),
          dailyCap: z.number().int().min(0).nullable(),
        })
        .loose(),
    })
    .loose(),
});

export type AutoSendByLangInput = {
  lang: {
    detected: string;
    channelReplyLanguage: string;
    draftLang: string;
    evaluatedLangs: readonly string[];
  };
  cells: readonly LangCell[];
  overrides: LangOverrides;
  /** Đầu vào `decideAutoSend`; `levels.channelLabel` là TRẦN (lớp này chỉ hạ); `settings.threshold`/`dailyCap` là cấu hình chung (chỉ siết thêm). */
  gate: AutoSendInput;
};

export type LangGateReason = (typeof LANG_GATE_REASONS)[number];

export type AutoSendByLangDecision = Omit<AutoSendDecision, 'reason'> & {
  reason: GateReason | LangGateReason | null;
  replyLang: ReplyLang | null;
  /** Ô là Tự động nhưng ngôn ngữ chưa đạt đánh giá → hạ về Chạy thử. */
  langEvalCapped: boolean;
};

function langHold(reason: LangGateReason, replyLang: ReplyLang | null): AutoSendByLangDecision {
  return {
    outcome: 'hold',
    failedGate: reason === 'lang_input_unreadable' ? 'input' : 'lang',
    reason,
    gatesPassed: 0,
    replyLang,
    langEvalCapped: false,
  };
}

/** Tự gửi theo ngôn ngữ. Nhận `unknown`; đầu vào hỏng → `hold`, không ném. */
export function decideAutoSendByLang(raw: unknown): AutoSendByLangDecision {
  const parsed = langInputSchema.safeParse(raw);
  if (!parsed.success) return langHold('lang_input_unreadable', null);
  const { lang, cells, overrides, gate } = parsed.data;

  const replyLang = resolveReplyLang(lang);
  if (replyLang === 'other') return langHold('lang_other', replyLang);
  if (lang.draftLang !== replyLang) return langHold('reply_lang_mismatch', replyLang);

  // Trần của người gọi + mức ô ngôn ngữ: lấy mức chặt hơn, không bao giờ nâng.
  const level = strictestMode([gate.levels.channelLabel, resolveLangLevel(cells, replyLang)]);
  const capped = level === 'auto' && !lang.evaluatedLangs.includes(replyLang);
  const channelLabel: AutomationMode = capped ? 'shadow' : level;

  const effective = resolveLangSettings(
    { threshold: gate.settings.threshold, dailyCap: gate.settings.dailyCap },
    replyLang,
    overrides,
  );
  const decision = decideAutoSend({
    ...gate,
    levels: { ...gate.levels, channelLabel },
    settings: { ...gate.settings, threshold: effective.threshold, dailyCap: effective.dailyCap },
  });
  return { ...decision, replyLang, langEvalCapped: capped };
}
