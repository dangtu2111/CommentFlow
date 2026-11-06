import { foldText, type KbGapTopic } from '@flow/shared';
import { z } from 'zod';
import { ACTION_KINDS } from '../confidence/confidence';
import { activeHoursSchema, isWithinActiveHours, localDayMinute } from '../gate/auto-send-gate';
import { HANDOFF_TEMPLATE_KEYS, type HandoffTemplateKey } from './decide-action';

/**
 * Quy tắc "hỏi đơn hàng" (FR-153) và "câu mời theo giờ làm việc" (FR-152). Hàm thuần, không LLM/DB.
 * Mọi tín hiệu ở đây chỉ thiên về chuyển người / câu thận trọng; đầu vào hỏng không ném.
 */

// ───────────────────────── FR-153: nhận ra câu hỏi tình trạng đơn ─────────────────────────

/** "đơn giá/đơn vị/đơn giản/đơn vị" không phải đơn hàng. */
const NOT_ORDER = /\bdon (?:gia|vi|gian|ve)\b/g;
const ORDER_MENTION = /\b(?:don hang|don|ma don|order|parcel|package|shipment|tracking)\b/;
const STATUS_ASK =
  /\b(?:den dau|toi dau|o dau|chua (?:giao|nhan|toi|den|thay)|(?:bao gio|khi nao) .*?(?:giao|den|toi|nhan)|sao chua|dang giao|da giao|van chua|bi (?:tre|cham|that lac)|tre roi|tinh trang|trang thai|kiem tra|tra cuu|where|status|track(?:ing)?|when will|not (?:arrived|received|here)|delayed|late)\b/;
/** Câu tự nó đã là hỏi đơn, không cần chữ "đơn". */
const STANDALONE =
  /\b(?:sao chua (?:giao|nhan|thay|toi|den)|hang (?:cua (?:minh|toi|em|chi|anh) )?(?:den|toi|o) dau|chua nhan duoc hang|ma van don|van don|where is my (?:order|package|parcel)|order status)\b/;

/**
 * Khách đang hỏi tình trạng đơn đã đặt ("đơn đến đâu", "sao chưa giao", "where is my order")?
 * Mua hàng ("chốt đơn", "đặt đơn"), hỏi giá, đơn giá/đơn vị → không. Không phải chuỗi → false.
 */
export function detectOrderStatusIntent(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const folded = foldText(text).replace(NOT_ORDER, ' ');
  if (STANDALONE.test(folded)) return true;
  return ORDER_MENTION.test(folded) && STATUS_ASK.test(folded);
}

type TopicEntry = { topic: KbGapTopic; sourced: boolean };

/**
 * Hỏi đơn hàng → chủ đề `order_status` luôn CHƯA nguồn (chưa đọc dữ liệu đơn, FR-153): `decideAction`
 * rồi chuyển hướng + chuyển người + ghi `kb_gaps`. Không phải hỏi đơn → giữ nguyên.
 */
export function withOrderStatusTopic(topics: TopicEntry[], text: unknown): TopicEntry[] {
  if (!detectOrderStatusIntent(text)) return topics;
  return [
    ...topics.filter((item) => item.topic !== 'order_status'),
    { topic: 'order_status', sourced: false },
  ];
}

// ───────────────────────── FR-152: giờ làm việc ─────────────────────────

export type BusinessHoursState = 'in_hours' | 'out_of_hours' | 'unknown';
export type NextOpening = { daysAhead: number; day: number; time: string };

function minuteOf(hhmm: string): number {
  const [hour, minute] = hhmm.split(':');
  return Number(hour) * 60 + Number(minute);
}

function readInstant(value: unknown): Date | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
}

function readHours(value: unknown) {
  const parsed = activeHoursSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Lần mở cửa kế tiếp (khung sớm nhất bắt đầu sau `now`, tối đa 7 ngày); không có → null. */
export function nextOpening(now: unknown, hoursInput: unknown): NextOpening | null {
  const at = readInstant(now);
  const hours = readHours(hoursInput);
  if (at === null || hours === null) return null;
  const local = localDayMinute(at, hours.timezone);
  if (local === null) return null;
  let best: (NextOpening & { from: number }) | null = null;
  for (const window of hours.windows) {
    const from = minuteOf(window.from);
    if (from === minuteOf(window.to)) continue;
    for (const day of window.days) {
      let daysAhead = (day - local.day + 7) % 7;
      if (daysAhead === 0 && from <= local.minute) daysAhead = 7;
      if (
        best === null ||
        daysAhead < best.daysAhead ||
        (daysAhead === best.daysAhead && from < best.from)
      ) {
        best = { daysAhead, day, time: window.from, from };
      }
    }
  }
  return best === null ? null : { daysAhead: best.daysAhead, day: best.day, time: best.time };
}

/**
 * Đang trong giờ làm việc? Chưa cấu hình / không có khung / hỏng → `unknown` (người dùng kết quả phải
 * coi như ngoài giờ: không hứa phản hồi ngay).
 */
export function evaluateBusinessHours(input: { now: unknown; hours: unknown }): {
  state: BusinessHoursState;
  nextOpening: NextOpening | null;
} {
  const at = readInstant(input.now);
  const hours = readHours(input.hours);
  if (at === null || hours === null || hours.windows.length === 0) {
    return { state: 'unknown', nextOpening: null };
  }
  if (isWithinActiveHours(at, hours)) return { state: 'in_hours', nextOpening: null };
  return { state: 'out_of_hours', nextOpening: nextOpening(at, hours) };
}

/** Cụm hứa phản hồi/gọi NGAY (đã bỏ dấu, chữ thường) — không được xuất hiện trong câu ngoài giờ. */
const IMMEDIATE_PROMISE =
  /\b(?:goi|lien he|phan hoi|tra loi|ho tro|xu ly)(?: lai)? ngay\b(?! mai| mot| hom| thu| \d)|\bngay lap tuc\b|\btrong (?:vai|\d+) phut\b|\b(?:call|reply|respond|contact|message|get back to)(?: you)?(?: right)? (?:now|away|immediately|instantly|asap)\b|\bimmediately\b|\bright away\b|\bright now\b/;

export function promisesImmediateReply(text: string): boolean {
  return IMMEDIATE_PROMISE.test(foldText(text));
}

export type InvitationLang = 'vi' | 'en';
type InvitationVariant = 'inHours' | 'outHours';
export type InvitationSource = 'shop' | 'default' | 'default_promise_blocked';
export type Invitation = {
  variant: InvitationVariant;
  hoursState: BusinessHoursState;
  items: Array<{ key: HandoffTemplateKey; text: string; source: InvitationSource }>;
};

const TOPIC_LABEL: Record<InvitationLang, Record<HandoffTemplateKey, string>> = {
  vi: {
    shipping: 'phí vận chuyển',
    discount: 'ưu đãi',
    order_status: 'đơn hàng',
    stock_check: 'tồn kho',
    other: 'câu hỏi',
  },
  en: {
    shipping: 'shipping',
    discount: 'discounts',
    order_status: 'your order',
    stock_check: 'stock',
    other: 'your question',
  },
};

const WEEKDAY: Record<InvitationLang, readonly string[]> = {
  vi: ['Chủ nhật', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** Cụm giờ mở cửa kế tiếp ("08:00 ngày mai" / "08:00 on Monday"); dùng chung với tin ngoài giờ FR-074. */
export function openingPhrase(lang: InvitationLang, opening: NextOpening): string {
  if (opening.daysAhead === 0) return `${opening.time} ${lang === 'vi' ? 'hôm nay' : 'today'}`;
  if (opening.daysAhead === 1) return `${opening.time} ${lang === 'vi' ? 'ngày mai' : 'tomorrow'}`;
  const weekday = WEEKDAY[lang][opening.day];
  return `${opening.time} ${lang === 'vi' ? weekday : `on ${weekday}`}`;
}

/** Câu mặc định khi shop chưa viết mẫu (hoặc mẫu ngoài giờ lỡ hứa ngay). Ngoài giờ KHÔNG bao giờ hứa ngay. */
function defaultText(
  key: HandoffTemplateKey,
  lang: InvitationLang,
  variant: InvitationVariant,
  opening: NextOpening | null,
): string {
  const label = TOPIC_LABEL[lang][key];
  if (variant === 'inHours') {
    return lang === 'vi'
      ? `Shop đã nhận câu hỏi về ${label}, nhân viên sẽ nhắn lại cho bạn sớm nhất có thể.`
      : `We received your question about ${label}; a team member will message you as soon as possible.`;
  }
  if (lang === 'vi') {
    const when =
      opening === null ? 'khi shop mở cửa trở lại' : `từ ${openingPhrase(lang, opening)}`;
    return `Shop đang ngoài giờ làm việc, nhân viên sẽ nhắn bạn về ${label} ${when}.`;
  }
  const when =
    opening === null ? 'once the shop opens again' : `from ${openingPhrase(lang, opening)}`;
  return `The shop is currently closed; a team member will message you about ${label} ${when}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function shopTemplate(templates: unknown, key: HandoffTemplateKey, variant: InvitationVariant) {
  const entry = isRecord(templates) ? templates[key] : undefined;
  const text = isRecord(entry) ? entry[variant] : undefined;
  return typeof text === 'string' && text.trim() !== '' ? text.trim() : null;
}

const invitationInputSchema = z.object({
  decision: z.object({
    action: z.enum(ACTION_KINDS),
    redirectTemplates: z.array(z.string()),
  }),
  lang: z.enum(['vi', 'en', 'other']),
  templates: z.unknown(),
  hours: z.unknown(),
  now: z.unknown(),
});

/**
 * Chọn câu mời chuyển hướng/chuyển người theo giờ làm việc (FR-152, `docs/09` §4). Chỉ `redirect`/`handoff`
 * có câu mời (`answer`/`clarify` → null). Trong giờ → `inHours`; ngoài giờ hoặc chưa rõ giờ → `outHours`.
 * Mẫu ngoài giờ của shop có cụm "gọi/phản hồi ngay" bị thay bằng câu mặc định nêu giờ mở cửa kế tiếp.
 * `templates` có dạng `brand_voice.handoff_templates` ({ [khóa]: { inHours, outHours } }).
 */
export function resolveInvitation(raw: unknown): Invitation | null {
  const parsed = invitationInputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { decision, lang, templates, hours, now } = parsed.data;
  if (decision.action !== 'redirect' && decision.action !== 'handoff') return null;

  const wanted = HANDOFF_TEMPLATE_KEYS.filter((key) => decision.redirectTemplates.includes(key));
  const keys: HandoffTemplateKey[] = wanted.length > 0 ? wanted : ['other'];
  const { state, nextOpening: opening } = evaluateBusinessHours({ now, hours });
  const variant: InvitationVariant = state === 'in_hours' ? 'inHours' : 'outHours';
  const language: InvitationLang = lang === 'vi' ? 'vi' : 'en';

  const items = keys.map((key) => {
    const shop = shopTemplate(templates, key, variant);
    if (shop === null) {
      return {
        key,
        text: defaultText(key, language, variant, opening),
        source: 'default' as const,
      };
    }
    if (variant === 'outHours' && promisesImmediateReply(shop)) {
      return {
        key,
        text: defaultText(key, language, variant, opening),
        source: 'default_promise_blocked' as const,
      };
    }
    return { key, text: shop, source: 'shop' as const };
  });
  return { variant, hoursState: state, items };
}
