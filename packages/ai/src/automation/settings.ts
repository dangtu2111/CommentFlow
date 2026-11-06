import { z } from 'zod';
import {
  ALWAYS_BLOCKED_LABELS,
  AUTOMATION_MODES,
  type ActiveHours,
  type AutomationMode,
  DEFAULT_THRESHOLD,
  keywordFold,
  THRESHOLD_FLOOR,
} from '../gate/auto-send-gate';

/**
 * Cấu hình tự gửi của một workspace (FR-070 ma trận Tắt/Chạy thử/Tự động theo kênh × nhãn; FR-071 cài đặt chung).
 * Schema Zod là ranh giới vào/ra của trang Cài đặt tự gửi và của kho lưu (`AutomationSettingsStore`).
 *
 * Nguyên tắc an toàn (docs/09 §6): mặc định mọi ô TẮT; ngưỡng không thấp hơn sàn 0,80; luôn có giới hạn/ngày;
 * nhãn Khiếu nại/Spam không có ô (Khiếu nại luôn bị chặn, FR-145). Trường lạ bị từ chối (`strict`).
 */

/** Ba nhãn có ô trong ma trận (FR-070). Nhãn còn lại không bao giờ tự gửi. */
export const MATRIX_LABELS = ['price', 'advice', 'purchase'] as const;
export type MatrixLabel = (typeof MATRIX_LABELS)[number];
export const MATRIX_TARGETS = ['comment', 'message'] as const;
export type MatrixTarget = (typeof MATRIX_TARGETS)[number];

/** Khoảng trễ trước khi gửi: 0/1/2/5 phút (FR-071). */
export const DELAY_SECONDS_OPTIONS = [0, 60, 120, 300] as const;
export const DAILY_CAP_MAX = 1000;
export const DEFAULT_DAILY_CAP = 50;
export const MAX_BLOCKED_KEYWORDS = 50;
export const MAX_KEYWORD_LENGTH = 60;
export const MAX_SIGNATURE_LENGTH = 120;
/** Số ô tối đa (kênh × 2 đối tượng × 3 nhãn) — chặn đầu vào phình to. */
export const MAX_RULES = 600;

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const ruleSchema = z
  .object({
    channelId: z.uuid(),
    target: z.enum(MATRIX_TARGETS),
    label: z.enum(MATRIX_LABELS),
    mode: z.enum(AUTOMATION_MODES),
  })
  .strict();
export type AutomationRule = z.infer<typeof ruleSchema>;

const activeHoursSchema = z
  .object({
    /** 0 = Chủ nhật … 6 = thứ Bảy (theo múi giờ workspace). */
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .refine((days) => new Set(days).size === days.length, 'Ngày trùng'),
    from: z.string().regex(HHMM),
    to: z.string().regex(HHMM),
  })
  .strict()
  .refine((hours) => hours.from !== hours.to, 'Giờ bắt đầu và kết thúc không được trùng');

/** Bỏ rỗng, bỏ trùng (không phân biệt hoa/thường/dấu) — giữ dạng viết gốc của lần xuất hiện đầu. */
function normalizeKeywords(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const keyword = item.trim();
    const key = keywordFold(keyword);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
  }
  return out;
}

export const automationConfigSchema = z
  .object({
    rules: z
      .array(ruleSchema)
      .max(MAX_RULES)
      .refine(
        (rules) =>
          new Set(rules.map((r) => `${r.channelId}|${r.target}|${r.label}`)).size === rules.length,
        'Ô trùng khóa (kênh, đối tượng, nhãn)',
      ),
    threshold: z.number().min(THRESHOLD_FLOOR).max(1),
    delaySeconds: z.union([z.literal(0), z.literal(60), z.literal(120), z.literal(300)]),
    dailyCap: z.number().int().min(1).max(DAILY_CAP_MAX),
    activeHours: activeHoursSchema.nullable(),
    blockedKeywords: z
      .array(z.string().max(MAX_KEYWORD_LENGTH + 20))
      .max(MAX_BLOCKED_KEYWORDS + 50)
      .transform(normalizeKeywords)
      .pipe(
        z
          .array(z.string().max(MAX_KEYWORD_LENGTH))
          .max(MAX_BLOCKED_KEYWORDS),
      ),
    signature: z
      .string()
      .transform((s) => s.trim())
      .pipe(
        z
          .string()
          .max(MAX_SIGNATURE_LENGTH)
          .refine((s) => !/[\r\n]/.test(s), 'Không xuống dòng'),
      )
      .nullable()
      .transform((s) => (s === '' || s === null ? null : s)),
  })
  .strict();
export type AutomationConfig = z.output<typeof automationConfigSchema>;

/** Mặc định an toàn: không ô nào bật (mọi ô = Tắt), ngưỡng 0,85, trễ 1 phút, 50 câu/ngày, cả ngày, không chữ ký. */
export const DEFAULT_AUTOMATION_CONFIG: Readonly<AutomationConfig> = Object.freeze({
  rules: [],
  threshold: DEFAULT_THRESHOLD,
  delaySeconds: 60,
  dailyCap: DEFAULT_DAILY_CAP,
  activeHours: null,
  blockedKeywords: [],
  signature: null,
});

export function parseAutomationConfig(raw: unknown) {
  return automationConfigSchema.safeParse(raw);
}

/** Mức của một ô; ô không khai báo = Tắt. */
export function modeFor(
  config: Pick<AutomationConfig, 'rules'>,
  cell: { channelId: string; target: MatrixTarget; label: MatrixLabel },
): AutomationMode {
  const rule = config.rules.find(
    (r) => r.channelId === cell.channelId && r.target === cell.target && r.label === cell.label,
  );
  return rule?.mode ?? 'off';
}

/**
 * Khối `settings` của đầu vào `decideAutoSend` (docs/09 §6) suy từ cấu hình + múi giờ workspace. `allowPartial`/
 * `allowClarify` do nơi gọi thêm (cột riêng, FR-141/147). Nhãn Khiếu nại luôn nằm trong `blockedLabels`.
 */
export function toGateSettings(config: AutomationConfig, ctx: { timezone: string }) {
  const activeHours: ActiveHours | null = config.activeHours
    ? {
        timezone: ctx.timezone,
        windows: [
          {
            days: [...config.activeHours.days],
            from: config.activeHours.from,
            to: config.activeHours.to,
          },
        ],
      }
    : null;
  return {
    threshold: config.threshold,
    dailyCap: config.dailyCap,
    blockedLabels: [...ALWAYS_BLOCKED_LABELS],
    blockedKeywords: [...config.blockedKeywords],
    activeHours,
  };
}
