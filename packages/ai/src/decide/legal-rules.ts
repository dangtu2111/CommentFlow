import { foldText } from '@flow/shared';
import { z } from 'zod';

/**
 * Quy tắc cam kết pháp lý/uy tín cho `decideAction` (DA-RULES-LEGAL, FR-160, Q-DRL1, `docs/09` §4).
 * Chính hãng, hóa đơn/VAT, bảo hành, nguồn gốc, hoàn tiền: BẮT BUỘC có nguồn (nguyên tắc #4, #9).
 * Hàm thuần, không LLM/DB. Đầu vào hỏng/quá dài → coi là chưa có nguồn (đóng khi lỗi, không "mở khi lỗi").
 *
 * Hai việc: (1) `evaluateLegalRules` đọc câu khách + nguồn tìm được → cờ `risks.legalUnsourced`
 * (`decideAction` chuyển người); (2) `checkDraftLegal` kiểm bản nháp AI trước khi tới nhân viên/cổng tự gửi.
 */

export const LEGAL_TOPICS = [
  'authenticity',
  'invoice',
  'warranty',
  'origin',
  'refund',
  'refund_guarantee',
  'regulatory_claim',
] as const;
export type LegalTopic = (typeof LEGAL_TOPICS)[number];

/** Trần độ dài mỗi văn bản / số đoạn nguồn: quá → không đọc được → đóng (chống tốn CPU). */
const MAX_TEXT_LENGTH = 20_000;
const MAX_SOURCES = 100;

/** Mẫu trên văn bản đã chuẩn hóa (`normalizeForMatch`), có ranh giới từ để tránh khớp giữa từ. */
const TOPIC_PATTERNS: Record<LegalTopic, RegExp> = {
  authenticity:
    /\b(chinh hang|hang that|hang gia|hang nhai|hang fake|hang xin|hang rep|hang auth|hang real|fake|auth|authentic\w*|genuine|replica|counterfeit)\b/,
  invoice: /\b(hoa don|invoice|hd|bill|chung tu|xuat thue)\b/,
  warranty: /\b(bao hanh|bh|warrant\w*|guarant\w*|1 doi 1)\b/,
  origin: /\b(nguon goc|xuat xu|nhap khau|xach tay|noi dia|san xuat tai|made in|origins?)\b/,
  refund:
    /\b(hoan tien|hoan lai tien|hoan tra|doi tra|tra hang|hoan hang|doi hang|tra lai tien|refund\w*|returns?|money back)\b/,
  // Cam kết hoàn tiền ("guarantee a refund", "money-back guarantee", "bao hoàn tiền", "hoàn tiền 100%"): cần nguồn nêu đúng cam kết đó. `PLAN_LEGAL_TOPIC` KHÔNG ánh xạ nhóm này
  // (fact plan không có sự kiện tương ứng nên không được coi là "đã phủ").
  refund_guarantee:
    /\b(guarantee(?:d)?\b.{0,20}\brefund\w*|money back guarantee|cam ket hoan tien|bao hoan tien|hoan tien 100)/,
  // Khẳng định quy định/y tế (FDA, được chứng nhận, điều trị…). Từ tiếng Việt có dấu xét riêng trên chữ gốc (REGULATORY_VI_PATTERN): "chữa" bỏ dấu thành "chua" trùng "chưa".
  regulatory_claim: /\b(fda|approved|certified|clinically)\b/,
};

/** Tiếng Việt có dấu: "chữa", "điều trị", "trị dứt" — xét trên chữ gốc (chưa bỏ dấu) để không chặn nhầm "chưa". */
const REGULATORY_VI_PATTERN = /(?<![\p{L}])(?:chữa|điều trị|trị dứt)(?![\p{L}])/u;

/**
 * "VAT" xét trên chữ gốc (chưa bỏ dấu): bỏ dấu sẽ biến "vật liệu" thành "vat lieu" và chặn nhầm.
 * Chấp nhận "V.A.T", "VAT10%", "ＶＡＴ" (đã NFKC); "vật" có dấu thì không khớp.
 */
const VAT_PATTERN = /\bv ?a ?t(?![\p{L}])/u;

/** NFKC (đưa chữ toàn độ rộng về thường) + bỏ ký tự điều khiển/rộng 0 + `-._` thành khoảng trắng + thường. */
function lightNormalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[-._]+/g, ' ')
    .toLowerCase();
}

function normalizeForMatch(text: string): string {
  return foldText(lightNormalize(text));
}

/** Các nhóm pháp lý văn bản nhắc đến, thứ tự cố định `LEGAL_TOPICS`, không trùng. Nhận chuỗi (hàm nội bộ). */
export function detectLegalTopics(text: string): LegalTopic[] {
  const folded = normalizeForMatch(text);
  const hasVat = VAT_PATTERN.test(lightNormalize(text).replace(/\s+/g, ' '));
  const hasRegulatoryVi = REGULATORY_VI_PATTERN.test(lightNormalize(text));
  return LEGAL_TOPICS.filter(
    (topic) =>
      TOPIC_PATTERNS[topic].test(folded) ||
      (topic === 'invoice' && hasVat) ||
      (topic === 'regulatory_claim' && hasRegulatoryVi),
  );
}

const WORD_NUMBERS: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  lam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
  muoi: 10,
  'muoi mot': 11,
  'muoi hai': 12,
  'hai muoi': 20,
  'ba muoi': 30,
  nua: 0.5,
};
const WORD_NUMBER_PATTERN = new RegExp(
  `\\b(${Object.keys(WORD_NUMBERS)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\s+(?=(?:thang|nam|ngay|tuan|gio|thg)\\b)`,
  'g',
);

const UNIT_PATTERN = '(thang|thg|nam|ngay|tuan|gio|month|year|day|week|hour)s?';
/** Số (nguyên/thập phân) + đơn vị; "30-day" đã thành "30 day" nhờ `lightNormalize`. */
const DURATION_PATTERN = new RegExp(`(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*${UNIT_PATTERN}\\b`, 'g');
const PERCENT_PATTERN = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
const LIFETIME_PATTERN = /\b(tron doi|suot doi|vinh vien|lifetime)\b/;

const DURATION_UNIT: Record<string, string> = {
  thang: 'thang',
  thg: 'thang',
  month: 'thang',
  nam: 'nam',
  year: 'nam',
  ngay: 'ngay',
  day: 'ngay',
  tuan: 'tuan',
  week: 'tuan',
  gio: 'gio',
  hour: 'gio',
};

/**
 * Thời hạn/mức cam kết ở dạng chuẩn hóa ("12 thang", "100%", "lifetime"); duy nhất.
 * Số bằng chữ ("một năm", "nửa năm") được đổi thành số trước khi trích.
 */
function extractCommitments(text: string): string[] {
  const folded = normalizeForMatch(text).replace(WORD_NUMBER_PATTERN, (_all, word: string) => {
    return `${WORD_NUMBERS[word]} `;
  });
  const found = new Set<string>();
  for (const match of folded.matchAll(DURATION_PATTERN)) {
    const unit = DURATION_UNIT[match[2] as string] as string;
    found.add(`${Number((match[1] as string).replace(',', '.'))} ${unit}`);
  }
  for (const match of folded.matchAll(PERCENT_PATTERN)) {
    found.add(`${Number((match[1] as string).replace(',', '.'))}%`);
  }
  if (LIFETIME_PATTERN.test(folded)) found.add('lifetime');
  return [...found];
}

const textSchema = z.string().max(MAX_TEXT_LENGTH);
const sourcesSchema = z.array(z.object({ id: z.string(), text: textSchema })).max(MAX_SOURCES);

function topicsCoveredBy(sources: ReadonlyArray<{ text: string }>): Set<LegalTopic> {
  const covered = new Set<LegalTopic>();
  for (const source of sources) {
    for (const topic of detectLegalTopics(source.text)) covered.add(topic);
  }
  return covered;
}

export type LegalSource = { id: string; text: string };

export type LegalEvaluation = {
  /** Nhóm khách nhắc đến. */
  asked: LegalTopic[];
  /** Nhóm đã có nguồn. */
  sourced: LegalTopic[];
  /** Nhóm khách hỏi mà chưa có nguồn nào nhắc. */
  unsourced: LegalTopic[];
  /** Cờ cho `decideAction` `risks.legalUnsourced`. */
  legalUnsourced: boolean;
  /** `false` = đầu vào hỏng (cờ bật theo kiểu đóng khi lỗi). */
  readable: boolean;
};

const evaluateInputSchema = z.object({ customerText: textSchema, sources: sourcesSchema });

/** FR-160: khách hỏi nhóm nào thì phải có ít nhất một đoạn nguồn nhắc đúng nhóm đó. */
export function evaluateLegalRules(raw: unknown): LegalEvaluation {
  const parsed = evaluateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { asked: [], sourced: [], unsourced: [], legalUnsourced: true, readable: false };
  }
  const { customerText, sources } = parsed.data;
  const asked = detectLegalTopics(customerText);
  const covered = topicsCoveredBy(sources);
  const sourced = asked.filter((topic) => covered.has(topic));
  const unsourced = asked.filter((topic) => !covered.has(topic));
  return { asked, sourced, unsourced, legalUnsourced: unsourced.length > 0, readable: true };
}

export type DraftLegalCheck = {
  ok: boolean;
  /** Nhóm pháp lý bản nháp nhắc đến. */
  mentioned: LegalTopic[];
  /** Nhóm bản nháp nhắc mà không có nguồn. */
  unsourced: LegalTopic[];
  /** Thời hạn/mức cam kết (dạng chuẩn hóa) trong nháp không có trong nguồn cùng nhóm. */
  unsourcedDurations: string[];
};

const draftInputSchema = z.object({ draftText: textSchema, sources: sourcesSchema });

/**
 * FR-160: bản nháp AI nhắc nhóm pháp lý phải có nguồn cùng nhóm, và thời hạn/mức (%) nêu ra phải xuất hiện
 * trong các nguồn đó. Không nhắc nhóm nào → `ok` (thời hạn giao hàng... thuộc guard FR-030, không xét ở đây).
 * Giới hạn đã biết (ghi ở handoff): chưa gắn từng thời hạn với đúng nhóm, chưa loại nguồn phủ định.
 */
export function checkDraftLegal(raw: unknown): DraftLegalCheck {
  const parsed = draftInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, mentioned: [], unsourced: [], unsourcedDurations: [] };

  const { draftText, sources } = parsed.data;
  const mentioned = detectLegalTopics(draftText);
  if (mentioned.length === 0) {
    return { ok: true, mentioned, unsourced: [], unsourcedDurations: [] };
  }
  const covered = topicsCoveredBy(sources);
  const unsourced = mentioned.filter((topic) => !covered.has(topic));

  const relevant = sources.filter((source) =>
    detectLegalTopics(source.text).some((topic) => mentioned.includes(topic)),
  );
  const allowed = new Set(relevant.flatMap((source) => extractCommitments(source.text)));
  const unsourcedDurations = extractCommitments(draftText).filter((item) => !allowed.has(item));

  return {
    ok: unsourced.length === 0 && unsourcedDurations.length === 0,
    mentioned,
    unsourced,
    unsourcedDurations,
  };
}
