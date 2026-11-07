import type { DraftVoice } from './draft/draft-prompt';
import { describeAddress } from './draft/draft-prompt';
import type { DraftLang, DraftResult } from './draft/draft-result';
import { normalizeAndDetectLang } from './normalize/normalize-lang';

/**
 * Guard câu trả lời bằng CODE, độc lập với bộ soạn (docs/09 §4 bước `guard`, FR-140/142). Bổ sung cho `checkGuardMoney`
 * (số tiền/link/SĐT): ở đây kiểm (1) mỗi ý `fact` có `source_ids` thuộc tập nguồn đã đưa vào prompt, (2) ngôn ngữ đúng,
 * (3) độ dài, (4) xưng hô đúng cấu hình `brand_voice`. Không gọi mạng/LLM; hàm thuần; vi phạm không chứa nội dung khách.
 */
export const REPLY_MAX_CHARS = 1000;

export type ReplyGuardCode =
  | 'claim_unsourced'
  | 'claim_unknown_source'
  | 'lang_mismatch'
  | 'too_long'
  | 'address_mismatch'
  | 'pronoun_mismatch';

export type ReplyGuardViolation = { code: ReplyGuardCode; detail?: string };

export type ReplyGuardInput = {
  reply: string;
  /** Ngôn ngữ câu trả lời phải có (ngôn ngữ của bình luận hoặc cố định theo kênh). */
  lang: DraftLang;
  voice: DraftVoice;
  claims: DraftResult['claims'];
  /** Id các nguồn ĐÃ đưa vào prompt. */
  allowedSourceIds: ReadonlySet<string>;
  maxChars?: number;
};

export type ReplyGuardResult = { ok: boolean; violations: ReplyGuardViolation[] };

const hasWord = (haystack: string, word: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${word}([^\\p{L}\\p{N}]|$)`, 'u').test(haystack);

/**
 * Cách gọi khách KHÁC cấu hình mà câu lại dùng. So khớp trên chữ CÓ DẤU (không bỏ dấu: "bán" ≠ "bạn"); chỉ bắt các
 * dạng không mơ hồ.
 */
const OTHER_CUSTOMER_FORMS: Record<DraftVoice['customerAddress'], readonly string[]> = {
  anh_chi: ['quý khách', 'bạn'],
  ban: ['anh/chị', 'quý khách'],
  quy_khach: ['anh/chị', 'bạn'],
  you: ['anh/chị', 'quý khách', 'bạn'],
};

function checkLanguage(reply: string, expected: DraftLang): ReplyGuardViolation | null {
  const detected = normalizeAndDetectLang({ text: reply });
  // Chỉ tin các quy tắc có bằng chứng thật; "default"/"context" nghĩa là không đủ căn cứ nên không kết tội.
  const strong = ['script', 'diacritics', 'detector', 'detector-other', 'mixed-majority'];
  if (!strong.includes(detected.rule)) return null;
  if (detected.lang === expected) return null;
  return { code: 'lang_mismatch', detail: `${expected}->${detected.lang}` };
}

export function checkReplyGuard(input: ReplyGuardInput): ReplyGuardResult {
  const violations: ReplyGuardViolation[] = [];
  const reply = input.reply.trim();
  if (reply === '') return { ok: true, violations };

  for (const claim of input.claims) {
    if (claim.kind !== 'fact') continue;
    if (claim.source_ids.length === 0) violations.push({ code: 'claim_unsourced' });
    else if (!claim.source_ids.every((id) => input.allowedSourceIds.has(id))) {
      violations.push({ code: 'claim_unknown_source' });
    }
  }

  if (reply.length > (input.maxChars ?? REPLY_MAX_CHARS)) violations.push({ code: 'too_long' });

  const language = checkLanguage(reply, input.lang);
  if (language) violations.push(language);

  const text = reply.normalize('NFC').toLowerCase();
  if (input.lang === 'vi') {
    for (const form of OTHER_CUSTOMER_FORMS[input.voice.customerAddress]) {
      if (hasWord(text, form)) violations.push({ code: 'address_mismatch', detail: form });
    }
    const { shop } = describeAddress(input.voice);
    // Shop xưng "shop"/"em"/"mình" cố định: bắt khi câu tự xưng bằng MỘT cách khác không mơ hồ ("mình xin", "em xin"…).
    const SELF = ['em', 'mình', 'shop'] as const;
    const configured = shop.normalize('NFC').toLowerCase();
    for (const other of SELF) {
      if (other === configured || configured === '') continue;
      if (
        new RegExp(`(^|[^\\p{L}\\p{N}])${other} (xin|sẽ|cảm ơn|gửi|tư vấn|hỗ trợ)`, 'u').test(text)
      ) {
        violations.push({ code: 'pronoun_mismatch', detail: other });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}
