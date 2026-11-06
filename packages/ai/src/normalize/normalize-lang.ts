/**
 * Chuẩn hóa văn bản + nhận diện ngôn ngữ (docs/05 FR-025/120/159; docs/09 §5, Q-PNL1).
 * Hàm thuần: không DB, không mạng, không LLM. Từ điển viết tắt và bộ nhận diện (lingua) cắm qua interface.
 * KHÔNG che PII ở đây (PII-MASK-PIPE).
 */

export type DetectedLang = 'vi' | 'en' | 'other';
export type KnownLang = 'vi' | 'en';

/** Từ điển viết tắt (hệ thống + workspace, bảng `abbreviations` do ABBREV-DICT cung cấp). */
export interface AbbreviationDict {
  /** Tra từ đã chuẩn hóa (NFC, thường, không dấu câu hai đầu) → dạng mở rộng, hoặc undefined. */
  lookup(token: string): string | undefined;
}

export interface LangDetection {
  lang: DetectedLang;
  /** 0..1 */
  confidence: number;
}

/**
 * Bộ nhận diện ngôn ngữ cắm ngoài (lingua). `all`: đủ bộ ngôn ngữ (chỉ dùng để bắt `other`);
 * `vi-en`: giới hạn tập {vi, en}. Trả null = không có ý kiến.
 */
export interface LangDetector {
  detect(text: string, mode: 'all' | 'vi-en'): LangDetection | null;
}

export type LangRule =
  | 'script'
  | 'detector-other'
  | 'diacritics'
  | 'abbreviation'
  | 'detector'
  | 'mixed-majority'
  | 'context'
  | 'default';

export interface NormalizeLangInput {
  text: string;
  dict?: AbbreviationDict;
  detector?: LangDetector;
  /** Ngôn ngữ tin trước của cùng khách/hội thoại (§5 quy tắc 4). */
  previousLang?: KnownLang | null;
  /** `channels.reply_language` (mặc định `vi`). */
  replyLanguage?: KnownLang | null;
}

export interface NormalizeLangResult {
  normalized: string;
  abbreviationHits: number;
  lang: DetectedLang;
  rule: LangRule;
}

/** Chặn đầu vào khổng lồ (bình luận Facebook tối đa ~8000 ký tự). */
const MAX_INPUT_CHARS = 20_000;
const OTHER_MIN_CONFIDENCE = 0.9;
const DETECTOR_MIN_CONFIDENCE = 0.6;
const SHORT_TEXT_MAX_WORDS = 3;

const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/u;
const VIETNAMESE_MARKS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/u;
const WORD = /[\p{L}\p{N}]+/gu;
const EDGE_PUNCT = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su;

// Từ chức năng tiếng Việt KHÔNG dấu và tiếng Anh — bằng chứng cho heuristic mặc định.
const VI_WORDS = new Set(
  (
    'khong co la cua bao nhieu gia hang con nay do nao duoc cho voi nhe nha ha oi shop minh em anh chi ' +
    'toi ban mua ao quan giay hoi can lay roi thi va nhung se dang rat qua lam sao dau may nhung'
  ).split(' '),
);
const EN_WORDS = new Set(
  (
    'the is are how much what do you have it in stock this that and for with can i want to price ' +
    'size color available please hi hello thanks thank me my your of on at buy order ship when where'
  ).split(' '),
);

export function createAbbreviationDict(
  entries: Readonly<Record<string, string>>,
): AbbreviationDict {
  const map = new Map<string, string>();
  for (const [key, expansion] of Object.entries(entries)) {
    const normalizedKey = normalizeBase(key);
    if (normalizedKey) map.set(normalizedKey, expansion);
  }
  return { lookup: (token) => map.get(token) };
}

function normalizeBase(text: string): string {
  return text.normalize('NFC').toLowerCase().normalize('NFC').replace(/\s+/gu, ' ').trim();
}

/** NFC, viết thường, gộp khoảng trắng, rồi mở rộng viết tắt từng từ (FR-025). */
export function normalizeText(
  text: string,
  dict?: AbbreviationDict,
): { text: string; abbreviationHits: number } {
  const base = normalizeBase(text.slice(0, MAX_INPUT_CHARS));
  if (!dict) return { text: base, abbreviationHits: 0 };
  let hits = 0;
  const expanded = base
    .split(' ')
    .map((word) => {
      const match = EDGE_PUNCT.exec(word);
      const core = match?.[2] ?? '';
      const expansion = core ? dict.lookup(core) : undefined;
      if (expansion === undefined) return word;
      hits += 1;
      return `${match?.[1] ?? ''}${expansion}${match?.[3] ?? ''}`;
    })
    .join(' ');
  return { text: normalizeBase(expanded), abbreviationHits: hits };
}

function wordsOf(text: string): string[] {
  return text.match(WORD) ?? [];
}

function countEvidence(words: readonly string[]): { vi: number; en: number } {
  let vi = 0;
  let en = 0;
  for (const word of words) {
    if (VI_WORDS.has(word)) vi += 1;
    if (EN_WORDS.has(word)) en += 1;
  }
  return { vi, en };
}

/** Heuristic mặc định cho tập {vi, en}: tỉ lệ từ chức năng trúng. Không có bằng chứng → null. */
function heuristicViEn(evidence: { vi: number; en: number }): LangDetection | null {
  const total = evidence.vi + evidence.en;
  if (total === 0) return null;
  const lang: KnownLang = evidence.en > evidence.vi ? 'en' : 'vi';
  return { lang, confidence: Math.max(evidence.vi, evidence.en) / total };
}

function fallbackLang(input: NormalizeLangInput): { lang: KnownLang; rule: LangRule } {
  if (input.previousLang) return { lang: input.previousLang, rule: 'context' };
  return { lang: input.replyLanguage ?? 'vi', rule: 'default' };
}

/**
 * `normalizeAndDetectLang` (docs/09 §4): chuẩn hóa + nhận ngôn ngữ theo §5, dừng ở quy tắc đầu tiên khớp.
 * Quy tắc 3–5 (Q-PNL1): detector/heuristic đủ tin → dùng; chưa đủ tin mà câu > 3 từ và có bằng chứng cả hai
 * ngôn ngữ → đa số từ (hòa → vi); còn lại → ngôn ngữ trước / reply_language / vi.
 */
export function normalizeAndDetectLang(input: NormalizeLangInput): NormalizeLangResult {
  const { text: normalized, abbreviationHits } = normalizeText(input.text, input.dict);
  const original = normalizeBase(input.text.slice(0, MAX_INPUT_CHARS));
  const done = (lang: DetectedLang, rule: LangRule): NormalizeLangResult => ({
    normalized,
    abbreviationHits,
    lang,
    rule,
  });

  // 0. Chữ viết không phải Latin, hoặc detector đầy đủ chắc chắn là ngôn ngữ khác.
  if (NON_LATIN_LETTER.test(original)) return done('other', 'script');
  const full = input.detector?.detect(original, 'all');
  if (full?.lang === 'other' && full.confidence >= OTHER_MIN_CONFIDENCE) {
    return done('other', 'detector-other');
  }
  // 1. Dấu tiếng Việt.
  if (VIETNAMESE_MARKS.test(original)) return done('vi', 'diacritics');
  // 2. Trúng từ điển viết tắt.
  if (abbreviationHits > 0) return done('vi', 'abbreviation');

  const words = wordsOf(original);
  const evidence = countEvidence(words);
  // 3. Detector giới hạn {vi, en} (mặc định: heuristic từ khóa) khi đủ tin cậy; câu ngắn bỏ qua (quy tắc 4).
  if (words.length > SHORT_TEXT_MAX_WORDS) {
    const restricted = input.detector?.detect(original, 'vi-en') ?? heuristicViEn(evidence);
    if (
      restricted &&
      restricted.lang !== 'other' &&
      restricted.confidence >= DETECTOR_MIN_CONFIDENCE
    ) {
      return done(restricted.lang, 'detector');
    }
    // 5. Trộn hai ngôn ngữ → đa số từ; hòa → vi.
    if (evidence.vi > 0 && evidence.en > 0) {
      return done(evidence.en > evidence.vi ? 'en' : 'vi', 'mixed-majority');
    }
  }
  // 4. Ngắn/không chắc → ngôn ngữ tin trước → reply_language → vi.
  const fallback = fallbackLang(input);
  return done(fallback.lang, fallback.rule);
}
