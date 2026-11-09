import { normalizeSearchText } from '@flow/shared';
import { resolvePlace } from './destinations';

/**
 * Đề xuất ĐỊNH TÍNH (FACT-QUALITATIVE) từ văn bản chính sách: chỉ rút ENUM khi cụm nguyên văn xuất hiện ("calculated at checkout", "ship to United States", "original payment method",
 * "responsible for return shipping costs"…). Nguyên văn chỉ làm bằng chứng; giá trị là enum, code viết câu theo ngôn ngữ khách khi trả lời.
 */
export type QualitativeShip = {
  destinations: string[];
  feeMode: 'at_checkout' | 'free' | null;
  daysMode: 'at_checkout' | null;
  evidence: string[];
};

export type QualitativeReturns = {
  refundTo: 'original_payment' | null;
  returnShippingPaidBy: 'customer_change_of_mind' | 'shop' | null;
  eligibility: 'varies_by_item' | null;
  evidence: string[];
};

const SHIP_TO =
  /(?:ship(?:s|ping)?|deliver(?:s|y)?|giao(?: hang)?)\s+(?:only\s+)?(?:to|toi|den)\s+(.+)$/;
const CHECKOUT = /(?:at|during)\s+checkout|khi thanh toan/;
const SHIP_WORDS = /(shipping|ship|delivery|van chuyen|giao hang)/;
const FEE_WORDS = /(shipping (?:charges?|costs?|fees?|rates?)|phi (?:ship|van chuyen|giao hang))/;
const TIME_WORDS = /(delivery times?|estimated delivery|thoi gian giao)/;
const HEDGE = /\b(may|might|could)\b/;

const CURRENCY_OF: Record<string, string> = {
  VN: 'VND',
  US: 'USD',
  CA: 'CAD',
  GB: 'GBP',
  AU: 'AUD',
};
export const currencyOfCountry = (code: string): string => CURRENCY_OF[code] ?? 'USD';

export function qualitativeShip(sentences: readonly string[]): QualitativeShip | null {
  const destinations = new Set<string>();
  const evidence: string[] = [];
  let feeMode: QualitativeShip['feeMode'] = null;
  let daysMode: QualitativeShip['daysMode'] = null;
  for (const sentence of sentences) {
    const norm = normalizeSearchText(sentence);
    const to = SHIP_TO.exec(norm);
    if (to) {
      const place = resolvePlace(to[1] as string);
      if (place !== null) {
        destinations.add(place.country);
        evidence.push(sentence);
      }
    }
    if (CHECKOUT.test(norm) && SHIP_WORDS.test(norm)) {
      if (FEE_WORDS.test(norm) && !HEDGE.test(norm)) {
        feeMode = 'at_checkout';
        evidence.push(sentence);
      } else if (TIME_WORDS.test(norm) && !HEDGE.test(norm)) {
        daysMode = 'at_checkout';
        evidence.push(sentence);
      }
    }
  }
  if (destinations.size === 0) return null;
  return { destinations: [...destinations], feeMode, daysMode, evidence: [...new Set(evidence)] };
}

const REFUND_TO =
  /(?:original payment method|original form of payment|phuong thuc thanh toan ban dau)/;
const RETURN_SHIP_CUSTOMER =
  /(?:you are responsible for|customer (?:is|pays|will pay)|khach chiu)[^.]*return shipping|return shipping (?:costs? )?(?:is|are) (?:paid by|the responsibility of) (?:the )?customer|khach chiu phi ship (?:khi )?(?:tra|doi) hang/;
const RETURN_SHIP_SHOP =
  /(?:we (?:will )?(?:pay|cover)|free) return shipping|shop chiu phi ship (?:khi )?(?:tra|doi) hang/;
const CHANGE_OF_MIND = /change[- ]of[- ]mind|doi y|khong vua y/;
const ELIGIBILITY =
  /(?:return )?eligibility depends on|depends on the items?|may not be eligible for return|tuy (?:tung )?san pham/;

export function qualitativeReturns(sentences: readonly string[]): QualitativeReturns | null {
  const out: QualitativeReturns = {
    refundTo: null,
    returnShippingPaidBy: null,
    eligibility: null,
    evidence: [],
  };
  for (const sentence of sentences) {
    const norm = normalizeSearchText(sentence);
    if (REFUND_TO.test(norm) && /refund|hoan tien/.test(norm)) {
      out.refundTo = 'original_payment';
      out.evidence.push(sentence);
    }
    if (RETURN_SHIP_SHOP.test(norm)) {
      out.returnShippingPaidBy = 'shop';
      out.evidence.push(sentence);
    } else if (RETURN_SHIP_CUSTOMER.test(norm) && CHANGE_OF_MIND.test(norm)) {
      out.returnShippingPaidBy = 'customer_change_of_mind';
      out.evidence.push(sentence);
    }
    if (ELIGIBILITY.test(norm) && /return|doi tra|tra hang/.test(norm)) {
      out.eligibility = 'varies_by_item';
      out.evidence.push(sentence);
    }
  }
  if (out.refundTo === null && out.returnShippingPaidBy === null && out.eligibility === null) {
    return null;
  }
  out.evidence = [...new Set(out.evidence)];
  return out;
}
