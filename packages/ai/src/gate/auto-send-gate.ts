import { COMMENT_LABELS, normalizeSearchText } from '@flow/shared';
import { z } from 'zod';
import { ACTION_KINDS } from '../confidence/confidence';
import { AUTO_SEND_POLICIES, effectiveAutoSendPolicy } from '../decide/decide-action';
import { checkGuardMoney } from '../guard-money';

/**
 * Cổng tự gửi `decideAutoSend` (FR-031, FR-141, `docs/09` §6) — CODE quyết định, AI chỉ được THÊM điều kiện
 * "cần duyệt" (`draft.needsHuman`), không bao giờ mở cổng (nguyên tắc #3, #9).
 *
 * Kiểm 11 cổng đúng thứ tự; trượt cổng nào → `hold` + `failedGate = gate:N` (khớp `drafts.failed_gate`)
 * + mã lý do (`drafts.not_auto_sent_reason`). Qua hết → `auto_send`, hoặc `would_send` khi mức là Chạy thử.
 * Hàm thuần, không LLM/DB: mọi dữ liệu đã được bước đọc DB hợp nhất (bài → kênh → workspace) trước khi gọi.
 * Đầu vào hỏng → `hold` `failedGate = input`, không ném (thiên về chặn). Module KHÔNG có đường ra lệnh ẩn.
 *
 * `sendRecheck` (§6.1, R1–R9) là lớp thứ hai chạy ngay trước khi gọi API — không thuộc file này.
 */

export const GATE_COUNT = 11;
export const AUTO_SEND_OUTCOMES = ['auto_send', 'would_send', 'hold'] as const;
export type AutoSendOutcome = (typeof AUTO_SEND_OUTCOMES)[number];

export const AUTOMATION_MODES = ['off', 'shadow', 'auto'] as const;
export type AutomationMode = (typeof AUTOMATION_MODES)[number];

/** Ngưỡng mặc định và sàn (docs/03 M08, §6 cổng 5). */
export const DEFAULT_THRESHOLD = 0.85;
export const THRESHOLD_FLOOR = 0.8;
/** Độ sẵn sàng tối thiểu để tự gửi (FR-146). */
export const READINESS_MIN_PERCENT = 80;
/** Khách hỏi lại cùng ý ≥ 3 lần → cần người (§6 cổng 6). */
export const REPEAT_HUMAN_THRESHOLD = 3;
/** Cửa sổ nhắn tin tự động (§6 cổng 11). */
export const MESSAGE_WINDOW_HOURS = 24;
/** Nhãn luôn bị chặn dù cài đặt bỏ (FR-145: Khiếu nại không bao giờ tự gửi). */
export const ALWAYS_BLOCKED_LABELS = ['complaint'] as const;

export const GATE_REASONS = [
  'input_unreadable',
  // 1
  'workspace_ai_off',
  'emergency_stopped',
  // 2
  'mode_off',
  // 3
  'post_override_off',
  // 4
  'label_blocked',
  // 5
  'confidence_below_threshold',
  // 6
  'handoff_action',
  'decision_needs_human',
  'policy_never',
  'draft_needs_human',
  'money_unsourced',
  'customer_angry',
  'prompt_injection',
  'repeat_limit',
  'image_product_unresolved',
  'partial_not_allowed',
  'clarify_not_allowed',
  'readiness_low',
  'human_holding',
  // 7
  'blocked_keyword',
  // 8
  'daily_cap_reached',
  // 9
  'cost_cap_reached',
  // 10
  'outside_active_hours',
  // 11
  'message_window_closed',
] as const;
export type GateReason = (typeof GATE_REASONS)[number];

/** Nhãn cổng để hiện "Không tự gửi vì…" (chỉ số = số cổng). */
export const GATE_LABELS: Readonly<Record<number, string>> = Object.freeze({
  1: 'Công tắc workspace / Dừng khẩn cấp',
  2: 'Mức kênh × nhãn',
  3: 'Ghi đè theo bài viết',
  4: 'Nhãn bị chặn',
  5: 'Ngưỡng độ tin cậy',
  6: 'Code tính lại "cần người"',
  7: 'Từ khóa chặn',
  8: 'Giới hạn tự gửi/ngày',
  9: 'Trần chi phí AI',
  10: 'Giờ hoạt động',
  11: 'Cửa sổ 24 giờ (tin nhắn)',
});

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const nonNegativeInt = z.number().int().min(0);
const nonNegative = z.number().finite().min(0);
const unit = z.number().finite().min(0).max(1);

/** Chuỗi ISO hoặc `Date`; không đọc được → đầu vào hỏng. */
const instant = z
  .union([z.date(), z.string()])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => Number.isFinite(d.getTime()), 'Thời điểm không hợp lệ');

function isKnownTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const activeHoursSchema = z.object({
  timezone: z.string().min(1).refine(isKnownTimeZone, 'Múi giờ không hợp lệ'),
  windows: z.array(
    z.object({
      /** 0 = Chủ nhật … 6 = thứ Bảy (theo múi giờ workspace). */
      days: z.array(z.number().int().min(0).max(6)).min(1),
      from: z.string().regex(HHMM),
      to: z.string().regex(HHMM),
    }),
  ),
});
export type ActiveHours = z.input<typeof activeHoursSchema>;

export const autoSendInputSchema = z.object({
  target: z.enum(['comment', 'message']),
  now: instant,
  workspace: z.object({
    aiEnabled: z.boolean(),
    emergencyStopped: z.boolean(),
    aiCostCapUsd: nonNegative.nullable(),
    aiCostMonthUsd: nonNegative,
  }),
  /** Mức đã tra theo (kênh, nhãn, ngôn ngữ) và ghi đè bài (nếu có). */
  levels: z.object({
    channelLabel: z.enum(AUTOMATION_MODES),
    post: z.enum(AUTOMATION_MODES).nullable(),
  }),
  settings: z.object({
    threshold: unit,
    dailyCap: nonNegativeInt.nullable(),
    blockedLabels: z.array(z.string()),
    blockedKeywords: z.array(z.string()),
    allowPartial: z.boolean(),
    allowClarify: z.boolean(),
    activeHours: activeHoursSchema.nullable(),
  }),
  /** Mọi nhãn của `extract` (FR-145) — cổng 4 kiểm tất cả. */
  labels: z.array(z.enum(COMMENT_LABELS)).min(1),
  /** Độ tin cậy DO CODE TÍNH (`computeConfidence`), không phải số model tự chấm. */
  confidence: unit,
  /** Phần cần dùng của `ActionDecision` (`decideAction`). */
  decision: z.object({
    action: z.enum(ACTION_KINDS),
    needsHuman: z.boolean(),
    autoSendPolicy: z.enum(AUTO_SEND_POLICIES),
    unansweredTopics: z.array(z.string()),
  }),
  /** Bản nháp + nguồn đã đưa vào prompt; trường lạ do AI thêm bị bỏ. */
  draft: z.object({
    reply: z.string(),
    /** AI xin duyệt (`needs_human` của JSON) — chỉ có thể CHẶN, không mở. */
    needsHuman: z.boolean(),
    claims: z.array(z.object({ kind: z.string() }).loose()),
    sources: z.array(z.string()),
    knownPricesVnd: z.array(nonNegative).optional(),
  }),
  /** Cờ "cần người" do bước khác đo (`DA-*`, `PII-*`, onboarding). BẮT BUỘC đủ: thiếu = không đọc được. */
  flags: z.object({
    customerAngry: z.boolean(),
    promptInjection: z.boolean(),
    repeatCount: nonNegativeInt,
    imageProductUnresolved: z.boolean(),
    humanHolding: z.boolean(),
    readinessPercent: z.number().finite().min(0).max(100),
  }),
  usage: z.object({ autoSentToday: nonNegativeInt }),
  /** Tin nhắn cuối của khách (chỉ tin nhắn); `null` ở tin nhắn → chặn cổng 11. */
  message: z.object({ lastInboundAt: instant }).nullable(),
});

export type AutoSendInput = z.input<typeof autoSendInputSchema>;
type Parsed = z.output<typeof autoSendInputSchema>;

export type AutoSendDecision = {
  outcome: AutoSendOutcome;
  /** `gate:1`…`gate:11`, `input` khi đầu vào hỏng, `null` khi qua hết. */
  failedGate: string | null;
  reason: GateReason | null;
  /** Số cổng đã qua trước khi trượt (= GATE_COUNT khi qua hết). */
  gatesPassed: number;
};

export function readAutoSendInput(raw: unknown): Parsed | null {
  const parsed = autoSendInputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

type Gate = (input: Parsed) => GateReason | null;

const gate1Switch: Gate = (i) => {
  if (!i.workspace.aiEnabled) return 'workspace_ai_off';
  if (i.workspace.emergencyStopped) return 'emergency_stopped';
  return null;
};

const gate2Mode: Gate = (i) => (i.levels.channelLabel === 'off' ? 'mode_off' : null);

const gate3PostOverride: Gate = (i) => (i.levels.post === 'off' ? 'post_override_off' : null);

const gate4Labels: Gate = (i) => {
  const blocked = new Set<string>([...ALWAYS_BLOCKED_LABELS, ...i.settings.blockedLabels]);
  return i.labels.some((label) => blocked.has(label)) ? 'label_blocked' : null;
};

const gate5Confidence: Gate = (i) => {
  const threshold = Math.max(i.settings.threshold, THRESHOLD_FLOOR);
  return i.confidence < threshold ? 'confidence_below_threshold' : null;
};

/** Cổng 6 — mọi lý do "cần người" do code tính lại; thứ tự cố định, lý do đầu tiên được báo. */
const gate6NeedsHuman: Gate = (i) => {
  const { decision, draft, flags, settings } = i;
  if (decision.action === 'handoff') return 'handoff_action';
  if (decision.needsHuman) return 'decision_needs_human';
  const policy = effectiveAutoSendPolicy(decision.autoSendPolicy, draft);
  if (policy === 'never') return 'policy_never';
  if (draft.needsHuman) return 'draft_needs_human';
  const guard = checkGuardMoney({
    reply: draft.reply,
    sources: draft.sources,
    ...(draft.knownPricesVnd === undefined ? {} : { knownPricesVnd: draft.knownPricesVnd }),
  });
  if (!guard.ok) return 'money_unsourced';
  if (flags.customerAngry) return 'customer_angry';
  if (flags.promptInjection) return 'prompt_injection';
  if (flags.repeatCount >= REPEAT_HUMAN_THRESHOLD) return 'repeat_limit';
  if (flags.imageProductUnresolved) return 'image_product_unresolved';
  if (policy === 'allow_clarify') {
    if (!settings.allowClarify) return 'clarify_not_allowed';
  } else if (policy === 'allow_partial' || decision.unansweredTopics.length > 0) {
    if (!settings.allowPartial) return 'partial_not_allowed';
  }
  if (flags.readinessPercent < READINESS_MIN_PERCENT) return 'readiness_low';
  if (flags.humanHolding) return 'human_holding';
  return null;
};

const gate7Keywords: Gate = (i) => {
  const text = ` ${normalizeSearchText(i.draft.reply)} `;
  const hit = i.settings.blockedKeywords
    .map((keyword) => normalizeSearchText(keyword))
    .filter((keyword) => keyword.length > 0)
    .some((keyword) => text.includes(keyword));
  return hit ? 'blocked_keyword' : null;
};

const gate8DailyCap: Gate = (i) => {
  const cap = i.settings.dailyCap;
  return cap !== null && i.usage.autoSentToday >= cap ? 'daily_cap_reached' : null;
};

const gate9CostCap: Gate = (i) => {
  const cap = i.workspace.aiCostCapUsd;
  return cap !== null && i.workspace.aiCostMonthUsd >= cap ? 'cost_cap_reached' : null;
};

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Thứ (0–6) và phút trong ngày của `now` theo múi giờ. */
export function localDayMinute(now: Date, timezone: string): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const day = WEEKDAY_INDEX[read('weekday')] ?? 0;
  return { day, minute: Number(read('hour')) * 60 + Number(read('minute')) };
}

/** Trong khung giờ? `from < to` cùng ngày; `from > to` qua đêm (kéo sang ngày sau); `from = to` rỗng. */
export function isWithinActiveHours(now: Date, hours: z.output<typeof activeHoursSchema>): boolean {
  const { day, minute } = localDayMinute(now, hours.timezone);
  return hours.windows.some((window) => {
    const from = minutesOf(window.from);
    const to = minutesOf(window.to);
    if (from < to) return window.days.includes(day) && minute >= from && minute < to;
    if (from > to) {
      const previousDay = (day + 6) % 7;
      return (
        (window.days.includes(day) && minute >= from) ||
        (window.days.includes(previousDay) && minute < to)
      );
    }
    return false;
  });
}

const gate10ActiveHours: Gate = (i) => {
  const hours = i.settings.activeHours;
  if (hours === null) return null;
  return isWithinActiveHours(i.now, hours) ? null : 'outside_active_hours';
};

const gate11MessageWindow: Gate = (i) => {
  if (i.target !== 'message') return null;
  if (i.message === null) return 'message_window_closed';
  const elapsedMs = i.now.getTime() - i.message.lastInboundAt.getTime();
  return elapsedMs < MESSAGE_WINDOW_HOURS * 3_600_000 ? null : 'message_window_closed';
};

/** Thứ tự cố định theo `docs/09` §6 — không có đường nào đổi. */
const GATES: readonly Gate[] = Object.freeze([
  gate1Switch,
  gate2Mode,
  gate3PostOverride,
  gate4Labels,
  gate5Confidence,
  gate6NeedsHuman,
  gate7Keywords,
  gate8DailyCap,
  gate9CostCap,
  gate10ActiveHours,
  gate11MessageWindow,
]);

const UNREADABLE: AutoSendDecision = Object.freeze({
  outcome: 'hold',
  failedGate: 'input',
  reason: 'input_unreadable',
  gatesPassed: 0,
});

/**
 * Quyết định tự gửi cho một bản nháp. Nhận `unknown` để mọi đầu vào hỏng đều về `hold` thay vì ném.
 */
export function decideAutoSend(raw: unknown): AutoSendDecision {
  const input = readAutoSendInput(raw);
  if (input === null) return UNREADABLE;

  for (const [index, gate] of GATES.entries()) {
    const reason = gate(input);
    if (reason !== null) {
      return { outcome: 'hold', failedGate: `gate:${index + 1}`, reason, gatesPassed: index };
    }
  }

  const shadow = input.levels.channelLabel === 'shadow' || input.levels.post === 'shadow';
  return {
    outcome: shadow ? 'would_send' : 'auto_send',
    failedGate: null,
    reason: null,
    gatesPassed: GATE_COUNT,
  };
}
