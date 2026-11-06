import { z } from 'zod';
import { maskPii } from './pii';
import { ruleFilter } from './rule-filter';
import { normalizeSearchText } from './search';

/**
 * Quy tắc spam (docs/05 FR-080, US-050, UF-4): hàm thuần, không DB, không LLM.
 * Quy tắc CHỈ đánh dấu (`mark`) hoặc bỏ qua (`skip`); `auto_hide` (Tự ẩn) là việc riêng (AUTO-HIDE, FR-081) và bị
 * từ chối ở đây. AI không bao giờ tự ẩn (nguyên tắc #3). Q-SPR1.
 */

export const SPAM_RULE_TYPES = [
  'keyword',
  'regex',
  'phone',
  'link',
  'emoji_only',
  'tag_only',
] as const;
export type SpamRuleType = (typeof SPAM_RULE_TYPES)[number];

export const SPAM_RULE_ACTIONS = ['mark', 'skip'] as const;
export type SpamRuleAction = (typeof SPAM_RULE_ACTIONS)[number];

export const PREVIEW_WINDOW_DAYS = 7;
export const PREVIEW_MAX_SAMPLES = 5;
export const SPAM_PATTERN_MAX = 200;
/** Chỉ so khớp phần đầu văn bản chừng này ký tự (chặn đầu vào khổng lồ làm treo regex). */
export const SPAM_TEXT_SCAN_MAX = 1000;

const PATTERNLESS: readonly SpamRuleType[] = ['phone', 'link', 'emoji_only', 'tag_only'];

// Lặp lồng nhau `(…+)+`, `(…*)*`, `(…|…)+`, tham chiếu ngược `\1` → nguy cơ ReDoS: từ chối.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/;
const ALTERNATION_REPEAT = /\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)[+*{]/;
const BACKREFERENCE = /\\[1-9]|\\k</;

export function isSafeRegex(pattern: string): boolean {
  if (NESTED_QUANTIFIER.test(pattern) || ALTERNATION_REPEAT.test(pattern)) return false;
  if (BACKREFERENCE.test(pattern)) return false;
  try {
    new RegExp(pattern, 'iu');
    return true;
  } catch {
    return false;
  }
}

const spamRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(SPAM_RULE_TYPES),
    pattern: z.string().trim().max(SPAM_PATTERN_MAX),
    action: z.enum(SPAM_RULE_ACTIONS),
  })
  .transform((r) => (PATTERNLESS.includes(r.type) ? { ...r, pattern: '' } : r))
  .refine((r) => PATTERNLESS.includes(r.type) || r.pattern !== '', { path: ['pattern'] })
  .refine((r) => r.type !== 'regex' || isSafeRegex(r.pattern), { path: ['pattern'] });

export type SpamRule = z.infer<typeof spamRuleSchema>;

export function parseSpamRule(input: unknown) {
  return spamRuleSchema.safeParse(input);
}

// Di động VN (như `maskPii`) + dạng 84… không dấu +; tách bằng khoảng trắng/chấm/gạch.
const PHONE = /(?<![\d+])(?:\+?84|0)[\s.-]?[35789]\d(?:[\s.-]?\d){7}(?!\d)/;
const LINK =
  /(?:https?:\/\/|www\.)\S+|(?<![@\w.-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|vn|info|biz|xyz|top|club|shop|site|online|live|vip)(?![\w-])\S*|(?<![@\w.-])(?:bit\.ly|tinyurl\.com|t\.me|zalo\.me|m\.me|wa\.me)\/\S+/i;

function matchKeyword(pattern: string, text: string): boolean {
  const haystack = ` ${normalizeSearchText(text)} `;
  return pattern
    .split(/[,;\n]/)
    .map((k) => normalizeSearchText(k))
    .filter((k) => k !== '')
    .some((k) => haystack.includes(` ${k} `));
}

function matchRegex(pattern: string, text: string): boolean {
  if (!isSafeRegex(pattern)) return false;
  return new RegExp(pattern, 'iu').test(text);
}

/** Một bình luận có khớp quy tắc không. Không ném lỗi: mẫu hỏng → không khớp. */
export function matchSpamRule(rule: SpamRule, comment: { text: string }): boolean {
  const text = comment.text.slice(0, SPAM_TEXT_SCAN_MAX);
  switch (rule.type) {
    case 'keyword':
      return matchKeyword(rule.pattern, text);
    case 'regex':
      return matchRegex(rule.pattern, text);
    case 'phone':
      return PHONE.test(text);
    case 'link':
      return LINK.test(text);
    case 'emoji_only':
      return onlyReason(text, 'emoji');
    case 'tag_only':
      return onlyReason(text, 'mention');
  }
}

function onlyReason(text: string, reason: 'emoji' | 'mention'): boolean {
  const r = ruleFilter({ text });
  return r.skip && r.reason === reason;
}

export type SpamSample = {
  id: string;
  text: string;
  /** Do chính Page viết → không tính (nguyên tắc #5). */
  isOwn?: boolean;
  deleted?: boolean;
};

export type SpamPreview = {
  matched: number;
  total: number;
  samples: { id: string; textMasked: string }[];
};

/** Xem trước: số bình luận (đã lọc của Page/đã xóa) khớp quy tắc; ví dụ đã che PII. */
export function previewSpamRule(rule: SpamRule, comments: readonly SpamSample[]): SpamPreview {
  const eligible = comments.filter((c) => !c.isOwn && !c.deleted);
  const hits = eligible.filter((c) => matchSpamRule(rule, c));
  return {
    matched: hits.length,
    total: eligible.length,
    samples: hits
      .slice(0, PREVIEW_MAX_SAMPLES)
      .map((c) => ({ id: c.id, textMasked: maskPii(c.text.slice(0, 300)) })),
  };
}
