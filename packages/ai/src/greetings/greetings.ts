import { z } from 'zod';
import {
  type BusinessHoursState,
  evaluateBusinessHours,
  type InvitationLang,
  type NextOpening,
  openingPhrase,
  promisesImmediateReply,
} from '../decide/order-hours-rules';
import { resolveReplyLang } from '../gate/lang-autosend';
import { RECHECK_CLOCK_SKEW_MS } from '../recheck/send-recheck';

/**
 * Tin chào / tin ngoài giờ / câu báo chuyển nhân viên (FR-074, FR-152; luật Meta docs/09 §6.1 R8, docs/12 §1).
 *
 * Hàm thuần `selectGreeting`: nhận dữ liệu ĐÃ ĐO (hội thoại, giờ làm việc, cấu hình) và trả "gửi loại nào, câu gì"
 * hoặc "không gửi vì…". Không gọi DB/mạng/LLM — câu là MẪU của shop hoặc mẫu mặc định, AI không soạn.
 * Nơi gửi thật (chưa nối, gap `MSG-GREETINGS-WIRE`) vẫn PHẢI qua `sendRecheck` R8 ngay trước khi gọi API.
 *
 * Luật G1–G7 theo thứ tự (Q-MSG1): G1 đầu vào hỏng · G2 đích không phải tin nhắn (nhắn riêng từ bình luận chỉ có
 * 1 tin, không dùng cho tin chào) · G3 người gửi là chính Page · G4 ngoài cửa sổ 24 giờ từ tin khách (không dùng
 * 7 ngày HUMAN_AGENT cho tin tự động) · G5 loại tin đang tắt · G6 nhân viên đang xử lý (chào/ngoài giờ) ·
 * G7 đã chào / còn trong thời gian chờ. Mặc định mọi loại TẮT.
 */

const HOUR = 3_600_000;
export const GREETING_WINDOW_MS = 24 * HOUR;
export const GREETING_DEFAULT_COOLDOWN_HOURS = 12;
export const GREETING_RULE_COUNT = 7;

export const GREETING_KINDS = ['greeting', 'out_of_hours', 'handoff_notice'] as const;
export type GreetingKind = (typeof GREETING_KINDS)[number];

export const GREETING_BLOCK_REASONS = [
  'input_unreadable', // G1
  'comment_not_supported', // G2
  'sender_is_page', // G3
  'window_expired', // G4
  'disabled', // G5
  'human_active', // G6
  'already_sent', // G7 (tin chào: 1 lần/hội thoại)
  'cooldown', // G7 (ngoài giờ / báo chuyển người)
] as const;
export type GreetingBlockReason = (typeof GREETING_BLOCK_REASONS)[number];

export const GREETING_BLOCK_LABELS: Readonly<Record<GreetingBlockReason, string>> = Object.freeze({
  input_unreadable: 'Không đọc được dữ liệu để chọn tin tự động',
  comment_not_supported: 'Tin chào chỉ gửi trong tin nhắn, không gửi từ bình luận',
  sender_is_page: 'Tin do chính Page gửi, không trả lời tự động',
  window_expired: 'Đã quá 24 giờ kể từ tin cuối của khách, không gửi tự động được',
  disabled: 'Loại tin tự động này đang tắt',
  human_active: 'Nhân viên đang xử lý hội thoại này',
  already_sent: 'Đã chào khách trong hội thoại này',
  cooldown: 'Vừa gửi tin tương tự, chờ hết thời gian chờ mới gửi lại',
});

const GREETING_LANGS = ['vi', 'en'] as const;
const TEMPLATE_FIELDS = ['greeting', 'outOfHours', 'handoffInHours', 'handoffOutHours'] as const;
type TemplateField = (typeof TEMPLATE_FIELDS)[number];

/** Biến mẫu cho phép; mọi `{`/`}` còn lại là lỗi cấu hình. */
const ALLOWED_PLACEHOLDER = /\{(?:shop_name|opening)\}/g;
const template = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((text) => !/[{}]/.test(text.replace(ALLOWED_PLACEHOLDER, '')), 'Biến mẫu không hợp lệ');
const languageTemplates = z
  .object({
    greeting: template,
    outOfHours: template,
    handoffInHours: template,
    handoffOutHours: template,
  })
  .partial();

/** Cấu hình theo kênh (lưu ở bảng cấu hình kênh — gap `MSG-GREETINGS-WIRE`). Mặc định tắt hết. */
export const greetingConfigSchema = z.object({
  greetingEnabled: z.boolean().default(false),
  outOfHoursEnabled: z.boolean().default(false),
  handoffNoticeEnabled: z.boolean().default(false),
  /** Ngôn ngữ dùng khi khách nói ngôn ngữ khác vi/en. */
  fallbackLang: z.enum(GREETING_LANGS).default('vi'),
  /** Thời gian chờ giữa hai tin ngoài giờ / hai câu báo chuyển người (≤ 24 giờ). */
  cooldownHours: z.number().int().min(1).max(24).default(GREETING_DEFAULT_COOLDOWN_HOURS),
  shopName: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((name) => !/[{}]/.test(name), 'Tên shop không được chứa ngoặc nhọn')
    .optional(),
  templates: z
    .object({ vi: languageTemplates.optional(), en: languageTemplates.optional() })
    .default({}),
});
export type GreetingConfig = z.output<typeof greetingConfigSchema>;

const instant = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => Number.isFinite(d.getTime()), 'Thời điểm không hợp lệ');

export const greetingInputSchema = z.object({
  now: instant,
  /** `message` = hội thoại tin nhắn; `comment` luôn bị chặn (G2). */
  target: z.enum(['message', 'comment']),
  /** `first_message` = tin đầu của khách trong hội thoại; `handoff` = vừa chuyển cho nhân viên. */
  event: z.enum(['first_message', 'handoff']),
  senderIsPage: z.boolean(),
  conversation: z.object({
    lastCustomerMessageAt: instant.nullable(),
    humanActive: z.boolean(),
    lastSent: z.object({
      greeting: instant.nullable(),
      outOfHours: instant.nullable(),
      handoffNotice: instant.nullable(),
    }),
  }),
  lang: z.object({ detected: z.string(), channelReplyLanguage: z.string() }),
  /** Giờ làm việc (`ActiveHours`); thiếu/hỏng → `unknown`. */
  hours: z.unknown(),
  config: z.unknown(),
});

export type GreetingTemplateSource = 'shop' | 'default' | 'default_promise_blocked';
export type GreetingResult =
  | {
      send: true;
      kind: GreetingKind;
      lang: InvitationLang;
      /** Khách nói ngôn ngữ ngoài vi/en → dùng ngôn ngữ dự phòng. */
      langFallback: boolean;
      text: string;
      source: GreetingTemplateSource;
      hoursState: BusinessHoursState;
      /** Hạn gửi (tin khách cuối + 24 giờ); nơi gửi kiểm lại bằng `sendRecheck` R8. */
      windowEndsAt: Date;
    }
  | { send: false; rule: string; reason: GreetingBlockReason; label: string };

function block(rule: number, reason: GreetingBlockReason): GreetingResult {
  return { send: false, rule: `greeting:G${rule}`, reason, label: GREETING_BLOCK_LABELS[reason] };
}

// ───────────────────────── mẫu câu mặc định ─────────────────────────

type DefaultSet = Record<TemplateField, (when: string) => string>;
const DEFAULTS: Record<InvitationLang, DefaultSet> = {
  vi: {
    greeting: () => 'Xin chào! Cảm ơn bạn đã nhắn tin cho {shop_name}. Bạn cần hỗ trợ gì ạ?',
    outOfHours: (when) =>
      `Cảm ơn bạn đã nhắn tin cho {shop_name}. Shop đang ngoài giờ làm việc, nhân viên sẽ nhắn lại cho bạn ${when}.`,
    handoffInHours: () =>
      'Shop đã nhận tin nhắn của bạn, nhân viên sẽ nhắn lại cho bạn sớm nhất có thể.',
    handoffOutHours: (when) =>
      `Shop đang ngoài giờ làm việc, nhân viên sẽ nhắn lại cho bạn ${when}.`,
  },
  en: {
    greeting: () => 'Hello! Thanks for messaging {shop_name}. How can we help you?',
    outOfHours: (when) =>
      `Thanks for messaging {shop_name}. We are currently closed; a team member will message you ${when}.`,
    handoffInHours: () =>
      'We received your message; a team member will message you as soon as possible.',
    handoffOutHours: (when) => `We are currently closed; a team member will message you ${when}.`,
  },
};

const SHOP_NAME_FALLBACK: Record<InvitationLang, string> = { vi: 'shop', en: 'our shop' };

/** Cụm "khi nào" cho mẫu mặc định (kèm giới từ). */
function whenClause(lang: InvitationLang, opening: NextOpening | null): string {
  if (opening === null) return lang === 'vi' ? 'khi shop mở cửa trở lại' : 'once the shop reopens';
  return `${lang === 'vi' ? 'từ' : 'from'} ${openingPhrase(lang, opening)}`;
}

/** Cụm giờ trần cho biến `{opening}` của mẫu shop. */
function openingValue(lang: InvitationLang, opening: NextOpening | null): string {
  if (opening === null) return lang === 'vi' ? 'khi shop mở cửa trở lại' : 'once the shop reopens';
  return openingPhrase(lang, opening);
}

function render(
  text: string,
  lang: InvitationLang,
  config: GreetingConfig,
  opening: NextOpening | null,
): string {
  return text
    .replaceAll('{shop_name}', config.shopName ?? SHOP_NAME_FALLBACK[lang])
    .replaceAll('{opening}', openingValue(lang, opening));
}

function fieldFor(kind: GreetingKind, state: BusinessHoursState): TemplateField {
  if (kind === 'greeting') return 'greeting';
  if (kind === 'out_of_hours') return 'outOfHours';
  return state === 'in_hours' ? 'handoffInHours' : 'handoffOutHours';
}

// ───────────────────────── chọn loại tin + chống lặp ─────────────────────────

function chooseKind(event: 'first_message' | 'handoff', state: BusinessHoursState): GreetingKind {
  if (event === 'handoff') return 'handoff_notice';
  return state === 'out_of_hours' ? 'out_of_hours' : 'greeting';
}

function isEnabled(kind: GreetingKind, config: GreetingConfig): boolean {
  if (kind === 'greeting') return config.greetingEnabled;
  if (kind === 'out_of_hours') return config.outOfHoursEnabled;
  return config.handoffNoticeEnabled;
}

type LastSent = z.output<typeof greetingInputSchema>['conversation']['lastSent'];

/** Chống lặp: tin chào 1 lần/hội thoại; tin khác chờ `cooldownHours`. Mốc ở tương lai → coi là vừa gửi. */
function repeatBlock(
  kind: GreetingKind,
  lastSent: LastSent,
  now: Date,
  cooldownHours: number,
): GreetingBlockReason | null {
  if (kind === 'greeting') return lastSent.greeting === null ? null : 'already_sent';
  const at = kind === 'out_of_hours' ? lastSent.outOfHours : lastSent.handoffNotice;
  if (at === null) return null;
  return now.getTime() - at.getTime() < cooldownHours * HOUR ? 'cooldown' : null;
}

function windowOpen(now: Date, lastCustomerMessageAt: Date): boolean {
  const age = now.getTime() - lastCustomerMessageAt.getTime();
  return age >= -RECHECK_CLOCK_SKEW_MS && age <= GREETING_WINDOW_MS;
}

/**
 * Chọn tin tự động cho một hội thoại tin nhắn. Hàm thuần; đầu vào hỏng → chặn `input_unreadable`, không ném.
 * Trả `send: true` chỉ khi mọi luật G1–G7 qua; câu đã thay biến và (với tin ngoài giờ) đã chặn lời hứa trả lời ngay.
 */
export function selectGreeting(raw: unknown): GreetingResult {
  const parsed = greetingInputSchema.safeParse(raw);
  if (!parsed.success) return block(1, 'input_unreadable');
  const input = parsed.data;
  const configParsed = greetingConfigSchema.safeParse(input.config ?? {});
  if (!configParsed.success) return block(1, 'input_unreadable');
  const config = configParsed.data;
  const { now, conversation } = input;

  if (input.target !== 'message') return block(2, 'comment_not_supported');
  if (input.senderIsPage) return block(3, 'sender_is_page');
  const lastCustomerMessageAt = conversation.lastCustomerMessageAt;
  if (lastCustomerMessageAt === null || !windowOpen(now, lastCustomerMessageAt)) {
    return block(4, 'window_expired');
  }

  const { state, nextOpening } = evaluateBusinessHours({ now, hours: input.hours });
  const kind = chooseKind(input.event, state);
  if (!isEnabled(kind, config)) return block(5, 'disabled');
  if (kind !== 'handoff_notice' && conversation.humanActive) return block(6, 'human_active');
  const repeated = repeatBlock(kind, conversation.lastSent, now, config.cooldownHours);
  if (repeated !== null) return block(7, repeated);

  const resolved = resolveReplyLang({
    detected: input.lang.detected,
    channelReplyLanguage: input.lang.channelReplyLanguage,
  });
  const langFallback = resolved === 'other';
  const lang: InvitationLang = langFallback ? config.fallbackLang : resolved;
  const field = fieldFor(kind, state);
  const shopText = config.templates[lang]?.[field];
  const afterHours = field !== 'greeting' && field !== 'handoffInHours';

  let source: GreetingTemplateSource = 'shop';
  let body = shopText ?? '';
  if (shopText === undefined) {
    source = 'default';
  } else if (afterHours && promisesImmediateReply(render(shopText, lang, config, nextOpening))) {
    source = 'default_promise_blocked';
  }
  if (source !== 'shop') body = DEFAULTS[lang][field](whenClause(lang, nextOpening));

  return {
    send: true,
    kind,
    lang,
    langFallback,
    text: render(body, lang, config, nextOpening),
    source,
    hoursState: state,
    windowEndsAt: new Date(lastCustomerMessageAt.getTime() + GREETING_WINDOW_MS),
  };
}
