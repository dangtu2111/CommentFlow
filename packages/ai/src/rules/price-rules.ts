import type { VariantAxis } from '../decide/decide-action';
import { extractClaims } from '../guard-money';

/**
 * Quy tắc giá của `decideAction` (DA-RULES-PRICE; FR-150 xung đột giá, FR-158 khoảng giá khi chưa rõ biến thể).
 *
 * Hàm THUẦN: không LLM, không DB. Giá kho do bước tra DB cấp (`products`/`product_variants`, nguyên tắc #4);
 * ở đây chỉ so sánh và dựng cờ `risks.priceConflict` cho `decideAction`. AI không xác nhận cũng không phủ nhận
 * giá khách nhắc: cờ bật → chuyển người (nguyên tắc #9). Thiếu giá kho thì KHÔNG tự kết luận xung đột
 * (`not_comparable`): câu về giá lúc đó vốn không có nguồn nên đã bị guard/`decideAction` chặn ở bước khác.
 */

type VndAmount = number;

/** Số tiền (đồng) hợp lệ làm giá kho: hữu hạn, > 0; làm tròn về đồng. */
function validStockPrices(raw: readonly number[]): VndAmount[] {
  return raw
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value));
}

/** Số tiền trong văn bản (đồng): duy nhất, tăng dần. Dùng cùng bộ rút của guard FR-030 (150k ≡ 150.000đ). */
export function extractPriceAmounts(text: string): VndAmount[] {
  const amounts = extractClaims(text)
    .filter((claim) => claim.kind === 'money' && claim.key.startsWith('vnd:'))
    .map((claim) => Number(claim.key.slice('vnd:'.length)));
  return [...new Set(amounts)].sort((a, b) => a - b);
}

/** Giá kho gần nhất với `amount`; hòa → số nhỏ hơn (xác định). `stock` đã sắp tăng dần, không rỗng. */
function nearestStock(amount: VndAmount, stock: readonly VndAmount[]): VndAmount {
  let best = stock[0] as VndAmount;
  for (const candidate of stock) {
    if (Math.abs(candidate - amount) < Math.abs(best - amount)) best = candidate;
  }
  return best;
}

export type PriceCheckStatus = 'matches' | 'conflict' | 'no_amount' | 'not_comparable';

export type PriceMention = {
  amountVnd: VndAmount;
  /** Giá kho gần nhất; `null` khi kho chưa có giá. */
  stockAmountVnd: VndAmount | null;
  matchesStock: boolean;
};

export type CaptionPriceCheck = {
  status: PriceCheckStatus;
  conflict: boolean;
  mentions: PriceMention[];
};

/** FR-150a: số tiền trong caption bài/quảng cáo ↔ giá kho (`post_price_mentions.matches_stock`). */
export function checkCaptionPrices(input: {
  captionText: string;
  stockPricesVnd: readonly number[];
}): CaptionPriceCheck {
  const amounts = extractPriceAmounts(input.captionText);
  if (amounts.length === 0) return { status: 'no_amount', conflict: false, mentions: [] };

  const stock = [...new Set(validStockPrices(input.stockPricesVnd))].sort((a, b) => a - b);
  if (stock.length === 0) {
    return {
      status: 'not_comparable',
      conflict: false,
      mentions: amounts.map((amountVnd) => ({
        amountVnd,
        stockAmountVnd: null,
        matchesStock: false,
      })),
    };
  }
  const mentions = amounts.map((amountVnd) => {
    const matchesStock = stock.includes(amountVnd);
    return {
      amountVnd,
      stockAmountVnd: matchesStock ? amountVnd : nearestStock(amountVnd, stock),
      matchesStock,
    };
  });
  const conflict = mentions.some((mention) => !mention.matchesStock);
  return { status: conflict ? 'conflict' : 'matches', conflict, mentions };
}

export type CustomerPriceCheck = {
  status: PriceCheckStatus;
  conflict: boolean;
  /** Các số tiền khách nhắc (đồng, tăng dần). */
  quotedVnd: VndAmount[];
};

/** FR-150b: khách nhắc một giá khác giá hiện tại ("hôm qua shop báo 199k"). */
export function checkCustomerQuotedPrice(input: {
  commentText: string;
  stockPricesVnd: readonly number[];
}): CustomerPriceCheck {
  const quotedVnd = extractPriceAmounts(input.commentText);
  if (quotedVnd.length === 0) return { status: 'no_amount', conflict: false, quotedVnd };

  const stock = validStockPrices(input.stockPricesVnd);
  if (stock.length === 0) return { status: 'not_comparable', conflict: false, quotedVnd };

  const conflict = quotedVnd.some((amount) => !stock.includes(amount));
  return { status: conflict ? 'conflict' : 'matches', conflict, quotedVnd };
}

/** Cảnh báo Owner "Giá quảng cáo khác giá kho" kèm hai con số (US-108, FR-150a). */
export type PriceOwnerAlert = {
  kind: 'ad_price_mismatch';
  adAmountVnd: VndAmount;
  stockAmountVnd: VndAmount;
};

export type PriceRisk = {
  /** Cấp thẳng cho `decideAction({ risks: { priceConflict } })`. */
  priceConflict: boolean;
  source: 'caption' | 'customer' | null;
  /** Chỉ có khi nguồn là caption; xung đột do khách nhắc chỉ chuyển người (lý do "Khách nhắc giá khác"). */
  ownerAlert: PriceOwnerAlert | null;
};

/** Gộp hai nguồn xung đột; caption thắng vì cần cảnh báo Owner. */
export function evaluatePriceRisk(input: {
  caption?: CaptionPriceCheck;
  customer?: CustomerPriceCheck;
}): PriceRisk {
  const mismatch = input.caption?.mentions.find(
    (mention) => !mention.matchesStock && mention.stockAmountVnd !== null,
  );
  if (mismatch?.stockAmountVnd != null) {
    return {
      priceConflict: true,
      source: 'caption',
      ownerAlert: {
        kind: 'ad_price_mismatch',
        adAmountVnd: mismatch.amountVnd,
        stockAmountVnd: mismatch.stockAmountVnd,
      },
    };
  }
  if (input.customer?.conflict)
    return { priceConflict: true, source: 'customer', ownerAlert: null };
  return { priceConflict: false, source: null, ownerAlert: null };
}

export type QuoteVariant = {
  priceVnd: number;
  size: string | null;
  color: string | null;
};

export type PriceQuote =
  | {
      kind: 'single';
      amountVnd: VndAmount;
      missingAxes: VariantAxis[];
      knownPricesVnd: VndAmount[];
    }
  | {
      kind: 'range';
      minVnd: VndAmount;
      maxVnd: VndAmount;
      /** Trục cần hỏi lại (cấp cho `decideAction.products.missingAxes`; FR-147 bậc 2). */
      missingAxes: VariantAxis[];
      knownPricesVnd: VndAmount[];
    }
  | {
      kind: 'none';
      reason: 'no_price' | 'variant_not_found';
      missingAxes: VariantAxis[];
      knownPricesVnd: VndAmount[];
    };

const normAxis = (value: string | null): string | null => {
  const trimmed = value?.normalize('NFKC').trim().toLowerCase() ?? '';
  return trimmed === '' ? null : trimmed;
};

const AXIS_FIELDS: Record<VariantAxis, 'size' | 'color'> = { size: 'size', color: 'color' };

/**
 * FR-158: giá để báo khi khách chưa nói rõ biến thể. Min/max do code lấy từ biến thể còn khớp lời khách;
 * `knownPricesVnd` là mọi giá có thể xuất hiện trong câu (đưa vào guard số tiền FR-030).
 */
export function buildPriceQuote(input: {
  variants: readonly QuoteVariant[];
  said: { size: string | null; color: string | null };
}): PriceQuote {
  const priced = input.variants
    .filter((variant) => Number.isFinite(variant.priceVnd) && variant.priceVnd > 0)
    .map((variant) => ({
      price: Math.round(variant.priceVnd),
      size: normAxis(variant.size),
      color: normAxis(variant.color),
    }));
  if (priced.length === 0) {
    return { kind: 'none', reason: 'no_price', missingAxes: [], knownPricesVnd: [] };
  }

  const saidSize = normAxis(input.said.size);
  const saidColor = normAxis(input.said.color);
  const matching = priced.filter(
    (variant) =>
      (saidSize === null || variant.size === saidSize) &&
      (saidColor === null || variant.color === saidColor),
  );
  if (matching.length === 0) {
    return { kind: 'none', reason: 'variant_not_found', missingAxes: [], knownPricesVnd: [] };
  }

  const knownPricesVnd = [...new Set(matching.map((variant) => variant.price))].sort(
    (a, b) => a - b,
  );
  const [minVnd, maxVnd] = [
    knownPricesVnd[0] as number,
    knownPricesVnd[knownPricesVnd.length - 1] as number,
  ];
  if (minVnd === maxVnd) {
    return { kind: 'single', amountVnd: minVnd, missingAxes: [], knownPricesVnd };
  }

  const said: Record<VariantAxis, string | null> = { size: saidSize, color: saidColor };
  const missingAxes = (Object.keys(AXIS_FIELDS) as VariantAxis[]).filter((axis) => {
    if (said[axis] !== null) return false;
    const values = new Set(
      matching.map((variant) => variant[AXIS_FIELDS[axis]]).filter((v) => v !== null),
    );
    return values.size > 1;
  });
  return { kind: 'range', minVnd, maxVnd, missingAxes, knownPricesVnd };
}
