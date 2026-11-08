import { foldText } from '@flow/shared';

/**
 * GUARD-SEMANTIC-SUPPORT (chủ dự án chốt 08/11/2026): câu trả lời KHẲNG ĐỊNH một khái niệm có/không (COD, ship quốc tế, trả góp, hóa đơn, đổi trả, hoàn tiền,
 * bảo hành) thì các nguồn ĐÃ DÙNG phải NÊU khái niệm đó. Bịa chính sách (vd "Shop có hỗ trợ ship COD" từ đoạn chỉ có phí ship) nghiêm trọng như sai giá.
 * Kiểm bằng CODE (từ khóa/đồng nghĩa vi+en sau khi bỏ dấu), độc lập với bộ soạn; không gọi mạng/LLM; vi phạm không chứa nội dung khách. Câu CHUYỂN HƯỚNG
 * ("chưa có thông tin về COD", "ib shop") và câu hỏi lại khách không bị coi là khẳng định. Không thay cho `checkGuardMoney` (số tiền) hay `checkReplyGuard`.
 */
export type ConceptId =
  | 'cod'
  | 'installment'
  | 'invoice'
  | 'international_shipping'
  | 'return'
  | 'refund'
  | 'warranty';

type Concept = {
  id: ConceptId;
  /** Câu khẳng định nhắc tới khái niệm (văn bản đã bỏ dấu, chữ thường). */
  mention: RegExp;
  /** Nguồn nêu khái niệm (cùng dạng). */
  support: RegExp;
};

const COD =
  /\bcod\b|thanh toan (khi|luc|sau khi) nhan hang|nhan hang (roi )?(moi )?(tra tien|thanh toan)|cash on delivery/;
const INSTALLMENT =
  /tra gop|tra sau|installments?|afterpay|klarna|affirm|buy now,? pay later|pay later/;
const INVOICE = /hoa don (do|vat|gtgt|dien tu)|xuat hoa don|\bvat\b|invoices?/;
/** Cách nói chung về giao quốc tế (đủ để hợp thức hóa MỘT nước bất kỳ). */
const INTERNATIONAL_GENERAL =
  /quoc te|nuoc ngoai|international|worldwide|overseas|global|all countries|moi quoc gia|khap the gioi/;
/** Tên nước/vùng thường gặp (đã bỏ dấu). */
const COUNTRIES = [
  'canada',
  'usa',
  'u s a',
  'united states',
  'us',
  'uk',
  'united kingdom',
  'england',
  'australia',
  'mexico',
  'germany',
  'france',
  'japan',
  'korea',
  'china',
  'singapore',
  'thailand',
  'malaysia',
  'hawaii',
  'alaska',
  'puerto rico',
  'europe',
  'asia',
  'nhat',
  'han quoc',
  'my',
  'uc',
  'duc',
  'phap',
  'anh',
];
const COUNTRY_WORD = new RegExp(
  `\\b(${COUNTRIES.map((c) => c.replace(/ /g, '\\s')).join('|')})\\b`,
  'g',
);

const CONCEPTS: readonly Concept[] = [
  { id: 'cod', mention: COD, support: COD },
  { id: 'installment', mention: INSTALLMENT, support: INSTALLMENT },
  { id: 'invoice', mention: INVOICE, support: INVOICE },
  {
    id: 'international_shipping',
    mention: new RegExp(
      `${INTERNATIONAL_GENERAL.source}|(ship|giao|gui|deliver|send)\\w*\\s+(to|di|sang|den|toi|ve)\\s+(the\\s+)?(${COUNTRIES.map((c) => c.replace(/ /g, '\\s')).join('|')})\\b`,
    ),
    support: INTERNATIONAL_GENERAL,
  },
  {
    id: 'return',
    mention: /doi tra|doi hang|tra hang|hoan tra|\breturns?\b|\bexchanges?\b/,
    support: /doi tra|doi hang|tra hang|hoan tra|\breturns?\b|\bexchanges?\b/,
  },
  {
    id: 'refund',
    mention: /hoan tien|\brefunds?\b|money back/,
    support: /hoan tien|\brefunds?\b|money back/,
  },
  {
    id: 'warranty',
    mention: /bao hanh|warranty|guarantee/,
    support: /bao hanh|warranty|guarantee/,
  },
];

/** Câu CHUYỂN HƯỚNG / nêu "chưa có thông tin": không phải khẳng định (cũng không phải phủ định có căn cứ). */
const ABSENCE =
  /(chua|khong) (co |nem |thay |ro |xac nhan )?thong tin|chua (ro|nem|xac nhan|thay)|chua co (thong tin|du lieu)|khong (nem|de cap)|ib shop|inbox shop|nhan (tin )?(cho )?shop|lien he (voi )?shop|(does|do|did) not (specify|mention|include|state)|not (specified|mentioned|stated)|(information|info|details?) (is |are )?not available|no information|(don'?t|do not|cannot|can'?t) (have|confirm)|please contact|contact the shop|let (the )?shop know|ho tro them/;

const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?…;])\s+|;\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');

export type ConceptViolation = { concept: ConceptId };
export type ConceptSupportResult = { ok: boolean; violations: ConceptViolation[] };

/** Có nêu NƯỚC/VÙNG cụ thể trong câu (đã bỏ dấu) → danh sách tên. */
const countriesIn = (folded: string): string[] =>
  [...folded.matchAll(COUNTRY_WORD)].map((m) => m[1] as string);

/**
 * Chiều của một câu về một khái niệm: phủ định nếu có từ phủ định đứng ngay trước khái niệm (≤ 3 từ, vd "không hỗ trợ COD", "do not offer COD", "no
 * international shipping") hoặc ngay sau ("COD không được hỗ trợ", "refunds are not available"). "COD không phụ thu" KHÔNG phải phủ định COD (phủ định
 * đứng sau nhưng không kèm động từ hỗ trợ/áp dụng). Văn bản đã bỏ dấu, chữ thường.
 */
const NEG_PRE =
  "khong|chua|ko|do not|does not|did not|don't|doesn't|cannot|can't|never|no|not|without|unable to";
const NEG_POST =
  "(?:khong|chua|ko) (?:duoc |con )?(?:ho tro|ap dung|nhan|co|cung cap|chap nhan|cho phep)|(?:is|are|isn't|aren't) not|not (?:available|supported|accepted|offered|eligible|possible)|unavailable|ineligible";

function polarityOf(folded: string, concept: Concept): 'pos' | 'neg' {
  const m = concept.mention.source;
  const neg = new RegExp(
    String.raw`\b(?:${NEG_PRE})\s+(?:[a-z']+\s+){0,3}?(?:${m})|(?:${m})\s+(?:[a-z']+\s+){0,3}?(?:${NEG_POST})`,
  );
  return neg.test(folded) ? 'neg' : 'pos';
}

/** Chiều mà các NGUỒN nêu về khái niệm: tập {pos, neg} (bỏ dòng "Hỏi:"/câu hỏi của FAQ). */
function sourcePolarities(sources: readonly string[], concept: Concept): Set<'pos' | 'neg'> {
  const found = new Set<'pos' | 'neg'>();
  for (const source of sources) {
    for (const raw of sentencesOf(source)) {
      const line = raw.trim();
      if (line.endsWith('?') || /^(hoi|q|question)\s*:/i.test(foldText(line))) continue;
      const folded = foldText(line);
      if (concept.support.test(folded)) found.add(polarityOf(folded, concept));
    }
  }
  return found;
}

export function checkConceptSupport(input: {
  reply: string;
  /** Văn bản các nguồn ĐÃ DÙNG để soạn câu. */
  sources: readonly string[];
}): ConceptSupportResult {
  const sourceText = foldText(input.sources.join('\n'));
  const violated = new Set<ConceptId>();
  for (const raw of sentencesOf(input.reply)) {
    // Câu hỏi lại khách và câu chuyển hướng/"chưa có thông tin" không phải khẳng định.
    if (raw.trim().endsWith('?')) continue;
    const sentence = foldText(raw);
    if (ABSENCE.test(sentence)) continue;
    for (const concept of CONCEPTS) {
      if (!concept.mention.test(sentence)) continue;
      let supported = concept.support.test(sourceText);
      if (concept.id === 'international_shipping' && !supported) {
        // Không có cách nói chung: nguồn phải nêu ĐÚNG nước/vùng mà câu khẳng định.
        const claimed = countriesIn(sentence);
        const inSource = new Set(countriesIn(sourceText));
        supported = claimed.length > 0 && claimed.every((name) => inSource.has(name));
      }
      if (!supported) {
        violated.add(concept.id);
        continue;
      }
      // Có nêu khái niệm: chiều của câu phải KHỚP chiều của nguồn (nguồn "không", câu "có" → loại; ngược lại cũng loại).
      // Nguồn nửa có nửa không (vd "COD nội thành có; tỉnh khác không") → không đủ căn cứ để kết tội.
      const sourceSide = sourcePolarities(input.sources, concept);
      if (sourceSide.size === 1 && !sourceSide.has(polarityOf(sentence, concept))) {
        violated.add(concept.id);
      }
    }
  }
  const violations = [...violated].map((concept) => ({ concept }));
  return { ok: violations.length === 0, violations };
}

const CONCEPT_LABEL: Record<ConceptId, { vi: string; en: string }> = {
  cod: { vi: 'hình thức thanh toán khi nhận hàng (COD)', en: 'cash on delivery (COD)' },
  installment: { vi: 'trả góp', en: 'installment payments' },
  invoice: { vi: 'xuất hóa đơn', en: 'invoices' },
  international_shipping: { vi: 'giao hàng quốc tế', en: 'international shipping' },
  return: { vi: 'đổi trả', en: 'returns' },
  refund: { vi: 'hoàn tiền', en: 'refunds' },
  warranty: { vi: 'bảo hành', en: 'warranty' },
};

/**
 * Câu chuyển hướng THEO MẪU (không gọi LLM) khi bản nháp khẳng định điều nguồn không nêu và không còn biến thể sạch: nói rõ "chưa có thông tin" về đúng
 * khái niệm và mời chờ nhân viên. Tự qua guard (câu "chưa có thông tin" không bị coi là khẳng định).
 */
export function unsupportedConceptReply(concepts: readonly ConceptId[], lang: 'vi' | 'en'): string {
  const labels = concepts.map((id) => CONCEPT_LABEL[id][lang]);
  if (lang === 'en') {
    const about = labels.length > 0 ? ` about ${labels.join(' and ')}` : '';
    return `Sorry, the shop has no information${about} in its current data. A team member will check and message you shortly.`;
  }
  const about = labels.length > 0 ? ` về ${labels.join(' và ')}` : '';
  return `Bạn ơi, shop chưa có thông tin${about} trong dữ liệu hiện có. Nhân viên shop sẽ kiểm tra và nhắn lại cho bạn sớm nhé.`;
}
