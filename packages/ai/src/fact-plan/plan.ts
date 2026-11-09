import { normalizeSearchText } from '@flow/shared';
import { canonicalProvince, findProvinces } from './regions';
import type {
  Fact,
  FactKind,
  FactPlan,
  FactPlanInput,
  FactTopic,
  FactValue,
  PlanProduct,
  PlanVariant,
  PolicyFacts,
  ShipRow,
  StockMode,
} from './types';

/**
 * Lập "fact plan" (ADR 017): hàm THUẦN, 0 lần gọi LLM. Mỗi sự kiện cần nói có giá trị từ dữ liệu có cấu trúc hoặc `unknown`; không bao giờ đoán (vd "Hà Nội" chỉ ra phí nội thành khi shop
 * khai đúng dòng nội thành Hà Nội; địa điểm không nhận ra → `unknown`; chưa nêu địa điểm mà phí khác nhau theo khu vực → hỏi lại tỉnh/thành).
 */
const known = (id: string, kind: FactKind, value: FactValue, sourceId: string): Fact => ({
  id,
  kind,
  status: 'known',
  value,
  sourceId,
});
const unknown = (id: string, kind: FactKind): Fact => ({ id, kind, status: 'unknown' });

// ── Sản phẩm ────────────────────────────────────────────────────────────────

function chosenVariant(
  product: PlanProduct,
  attrs: Record<string, string> | null | undefined,
): PlanVariant | null {
  // Sản phẩm chỉ có MỘT biến thể: khách không cần chọn — chính nó.
  if (product.variants.length === 1 && (!attrs || Object.keys(attrs).length === 0)) {
    return product.variants[0] as PlanVariant;
  }
  if (!attrs || Object.keys(attrs).length === 0) return null;
  const matches = product.variants.filter((variant) =>
    Object.entries(attrs).every(([key, value]) => variant.attrsNorm[key] === value),
  );
  return matches.length === 1 ? (matches[0] as PlanVariant) : null;
}

function priceFacts(product: PlanProduct, n: number, variant: PlanVariant | null): Fact[] {
  const { id, currency } = product;
  const single = (amountMinor: number): Fact =>
    known(`price.${n}`, 'price', { type: 'money', amountMinor, currency }, id);
  if (variant !== null) {
    const amount = variant.priceMinor ?? product.priceMinor;
    return [amount === null ? unknown(`price.${n}`, 'price') : single(amount)];
  }
  const prices = [
    ...new Set(product.variants.flatMap((v) => (v.priceMinor === null ? [] : [v.priceMinor]))),
  ].sort((a, b) => a - b);
  if (prices.length > 1) {
    return [
      known(
        `price_range.${n}`,
        'price_range',
        {
          type: 'money_range',
          minMinor: prices[0] as number,
          maxMinor: prices[prices.length - 1] as number,
          currency,
        },
        id,
      ),
    ];
  }
  const only = prices[0] ?? product.priceMinor;
  return [only === null || only === undefined ? unknown(`price.${n}`, 'price') : single(only)];
}

function stockFact(
  product: PlanProduct,
  n: number,
  variant: PlanVariant | null,
  mode: StockMode,
): Fact {
  const id = `stock.${n}`;
  const sourceId = product.id;
  // Sản phẩm CÓ biến thể mà chưa chọn được đúng một biến thể: KHÔNG bao giờ nêu SỐ LƯỢNG (số tổng/đầu sản phẩm không phải số của loại khách hỏi) — chỉ còn/hết hàng theo các biến thể.
  if (variant === null && product.variants.length > 0) {
    const stocks = product.variants.map((v) => v.stock);
    if (product.stockStale === true || stocks.every((s) => s === null)) return unknown(id, 'stock');
    const anyIn = stocks.some((s) => s !== null && s > 0);
    return known(id, 'stock', { type: 'stock', display: anyIn ? 'in' : 'out' }, sourceId);
  }
  const stock = variant === null ? product.stock : variant.stock;
  if (product.stockStale === true || stock === null) return unknown(id, 'stock');
  if (stock <= 0) return known(id, 'stock', { type: 'stock', display: 'out' }, sourceId);
  if (mode.lowAt !== null && stock <= mode.lowAt) {
    return known(id, 'stock', { type: 'stock', display: 'low' }, sourceId);
  }
  return mode.disclose === 'count'
    ? known(id, 'stock', { type: 'stock', display: 'count', n: stock }, sourceId)
    : known(id, 'stock', { type: 'stock', display: 'in' }, sourceId);
}

// ── Khu vực ship ────────────────────────────────────────────────────────────

function validShipRows(rows: readonly ShipRow[]): { rows: ShipRow[]; issues: string[] } {
  const valid: ShipRow[] = [];
  const issues: string[] = [];
  for (const row of rows) {
    if (row.kind === 'city') {
      if (row.city === undefined || row.city.trim() === '') {
        issues.push(`Dòng "${row.label}": nội thành bắt buộc ghi thành phố — bỏ qua.`);
        continue;
      }
      if (canonicalProvince(row.city) === null) {
        issues.push(`Dòng "${row.label}": thành phố "${row.city}" không nhận ra — bỏ qua.`);
        continue;
      }
    }
    if (row.kind === 'region' && !(row.places ?? []).some((p) => canonicalProvince(p) !== null)) {
      issues.push(`Dòng "${row.label}": không có tỉnh/thành nào nhận ra — bỏ qua.`);
      continue;
    }
    valid.push(row);
  }
  return { rows: valid, issues };
}

const PRIORITY: Record<ShipRow['kind'], number> = { city: 0, region: 1, nationwide: 2 };

function rowMatches(row: ShipRow, province: string): boolean {
  if (row.kind === 'nationwide') return false;
  if (row.kind === 'city') return canonicalProvince(row.city as string) === province;
  return (row.places ?? []).some((place) => canonicalProvince(place) === province);
}

type Resolution = { kind: 'row'; row: ShipRow } | { kind: 'ask' } | { kind: 'unknown' };

/** Chọn dòng ship theo địa điểm khách; `signature` quyết định hai dòng có "cho kết quả giống nhau" (khi chưa nêu địa điểm). */
function resolveRow(
  rows: readonly ShipRow[],
  location: string | null | undefined,
  signature: (row: ShipRow) => string,
): Resolution {
  if (rows.length === 0) return { kind: 'unknown' };
  const text = location?.trim() ?? '';
  const provinces = text === '' ? [] : findProvinces(text);
  if (provinces.length > 1) return { kind: 'ask' };
  if (provinces.length === 0) {
    if (text !== '') return { kind: 'unknown' }; // nêu nơi nhưng không nhận ra / ngoài VN: không đoán
    return new Set(rows.map(signature)).size > 1
      ? { kind: 'ask' }
      : { kind: 'row', row: rows[0] as ShipRow };
  }
  const province = provinces[0] as string;
  const ordered = [...rows].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  const hit =
    ordered.find((row) => rowMatches(row, province)) ??
    ordered.find((row) => row.kind === 'nationwide');
  return hit ? { kind: 'row', row: hit } : { kind: 'unknown' };
}

// ── Chính sách ──────────────────────────────────────────────────────────────

function policyFact(
  topic:
    | 'returns'
    | 'refund_to'
    | 'return_shipping'
    | 'return_eligibility'
    | 'warranty'
    | 'payment',
  policy: PolicyFacts,
): Fact {
  if (topic === 'refund_to') {
    const r = policy.returns;
    return r?.refundTo
      ? known('refund_to', 'refund_to', { type: 'refund_to', to: r.refundTo }, r.sourceId)
      : unknown('refund_to', 'refund_to');
  }
  if (topic === 'return_shipping') {
    const r = policy.returns;
    return r?.returnShippingPaidBy
      ? known(
          'return_shipping',
          'return_shipping',
          { type: 'return_shipping', payer: r.returnShippingPaidBy },
          r.sourceId,
        )
      : unknown('return_shipping', 'return_shipping');
  }
  if (topic === 'return_eligibility') {
    const r = policy.returns;
    return r?.eligibility
      ? known(
          'return_eligibility',
          'return_eligibility',
          { type: 'return_eligibility', mode: r.eligibility },
          r.sourceId,
        )
      : unknown('return_eligibility', 'return_eligibility');
  }
  if (topic === 'returns') {
    const r = policy.returns;
    if (!r) return unknown('returns', 'returns');
    if (r.none === true) return known('returns', 'returns', { type: 'none' }, r.sourceId);
    return r.days === null
      ? unknown('returns', 'returns')
      : known(
          'returns',
          'returns',
          {
            type: 'days_count',
            n: r.days,
            ...(r.conditions && r.conditions.length > 0 ? { conditions: r.conditions } : {}),
          },
          r.sourceId,
        );
  }
  if (topic === 'warranty') {
    const w = policy.warranty;
    if (!w) return unknown('warranty', 'warranty');
    if (w.none === true) return known('warranty', 'warranty', { type: 'none' }, w.sourceId);
    return w.months === null
      ? unknown('warranty', 'warranty')
      : known(
          'warranty',
          'warranty',
          { type: 'months_count', n: w.months, ...(w.scope ? { scope: w.scope } : {}) },
          w.sourceId,
        );
  }
  const p = policy.payment;
  return p
    ? known('payment', 'payment', { type: 'methods', methods: p.methods }, p.sourceId)
    : unknown('payment', 'payment');
}

/** Phạm vi bảo hành (vd. "đường may") khớp câu khách: cả cụm, hoặc một từ ≥ 4 ký tự của phạm vi, đều theo ranh giới từ, đã bỏ dấu. KHÔNG đồng nghĩa, KHÔNG LLM. */
export function scopeMatches(scope: string, customerText: string): boolean {
  const text = ` ${normalizeSearchText(customerText)} `;
  const phrase = normalizeSearchText(scope);
  if (phrase === '') return false;
  if (text.includes(` ${phrase} `)) return true;
  return phrase.split(' ').some((word) => word.length >= 4 && text.includes(` ${word} `));
}

export function buildFactPlan(input: FactPlanInput): FactPlan {
  const facts: Fact[] = [];
  const unknownTopics = new Set<FactTopic>();
  const issues: string[] = [];
  let clarify: FactPlan['clarify'] = null;
  let handoff = false;
  let requiresHumanReview = false;
  const mark = (topic: FactTopic, fact: Fact) => {
    facts.push(fact);
    if (fact.status === 'unknown') unknownTopics.add(topic);
  };

  const variant = (product: PlanProduct) => chosenVariant(product, input.variantAttrs);
  input.products.forEach((product, index) => {
    const n = index + 1;
    const chosen = variant(product);
    facts.push(
      known(`product_name.${n}`, 'product_name', { type: 'text', text: product.name }, product.id),
    );
    // Nêu biến thể trong câu CHỈ khi khách đã nêu size/màu; biến thể duy nhất tự chọn (khách không chọn) không được nhắc tên (vd. "Ships From China Mainland").
    const customerChoseVariant = Object.keys(input.variantAttrs ?? {}).length > 0;
    if (
      chosen !== null &&
      customerChoseVariant &&
      input.topics.some((t) => t === 'price' || t === 'stock')
    ) {
      facts.push(
        known(`variant.${n}`, 'variant', { type: 'text', text: chosen.label }, product.id),
      );
    }
    if (input.topics.includes('price')) {
      for (const fact of priceFacts(product, n, chosen)) mark('price', fact);
    }
    if (input.topics.includes('stock')) mark('stock', stockFact(product, n, chosen, input.stock));
  });
  (input.measures ?? []).forEach((text, index) => {
    facts.push(
      known(
        `customer_measure.${index + 1}`,
        'customer_measure',
        { type: 'text', text },
        'customer',
      ),
    );
  });

  const { rows, issues: rowIssues } = validShipRows(input.policy.shipping);
  issues.push(...rowIssues);
  // Khách hỏi giao tới quốc gia nào → chỉ xét các dòng giao tới quốc gia đó (dòng không ghi destinations = Việt Nam).
  const countriesOf = (row: ShipRow) => row.destinations ?? ['VN'];
  const deliverable =
    input.destination === undefined || input.destination === null
      ? rows
      : rows.filter((row) => countriesOf(row).includes(input.destination?.country ?? ''));
  const destinationFact = () => {
    const place = input.destination;
    if (rows.length === 0)
      return mark('ship_destination', unknown('ship_destination', 'ship_destination'));
    if (place === undefined || place === null) {
      // Khách hỏi "ship tỉnh?" không nêu nơi cụ thể: có dòng toàn quốc thì trả lời "giao toàn quốc"; không có → chưa biết (không đoán).
      const nationwide = rows.find((row) => row.kind === 'nationwide');
      if (!nationwide)
        return mark('ship_destination', unknown('ship_destination', 'ship_destination'));
      return mark(
        'ship_destination',
        known(
          'ship_destination',
          'ship_destination',
          {
            type: 'destination',
            ok: true,
            place: countriesOf(nationwide)[0] as string,
            shipsTo: [...new Set(rows.flatMap(countriesOf))],
            nationwide: true,
          },
          nationwide.sourceId,
        ),
      );
    }
    const hit = rows.find((row) => countriesOf(row).includes(place.country));
    const shipsTo = [...new Set(rows.flatMap(countriesOf))];
    mark(
      'ship_destination',
      known(
        'ship_destination',
        'ship_destination',
        { type: 'destination', ok: hit !== undefined, place: place.country, shipsTo },
        (hit ?? (rows[0] as ShipRow)).sourceId,
      ),
    );
  };
  const shipping = (topic: 'ship_fee' | 'ship_time') => {
    const signature = (row: ShipRow) =>
      `${row.feeMode ?? ''}|${row.freeOverMinor ?? ''}|${row.daysMode ?? ''}|${row.feeMinor}|${row.daysMin}|${row.daysMax}|${row.currency}`;
    const resolved = resolveRow(deliverable, input.location, signature);
    if (resolved.kind === 'ask') {
      clarify = { ask: 'region' };
      facts.push(unknown(topic, topic));
      return;
    }
    if (resolved.kind === 'unknown') return mark(topic, unknown(topic, topic));
    const { row } = resolved;
    if (topic === 'ship_fee') {
      const mode = row.feeMode ?? (row.feeMinor === null ? null : 'fixed');
      if (mode === 'at_checkout' || mode === 'free') {
        return mark(topic, known(topic, topic, { type: 'fee_mode', mode }, row.sourceId));
      }
      if (mode === 'free_over') {
        if (row.freeOverMinor === undefined || row.freeOverMinor === null) {
          return mark(topic, unknown(topic, topic));
        }
        return mark(
          topic,
          known(
            topic,
            topic,
            { type: 'fee_mode', mode, overMinor: row.freeOverMinor, currency: row.currency },
            row.sourceId,
          ),
        );
      }
      return mark(
        topic,
        mode === null || row.feeMinor === null
          ? unknown(topic, topic)
          : known(
              topic,
              topic,
              { type: 'money', amountMinor: row.feeMinor, currency: row.currency },
              row.sourceId,
            ),
      );
    }
    const daysMode = row.daysMode ?? (row.daysMin === null ? 'not_stated' : 'range');
    if (daysMode === 'at_checkout') {
      return mark(
        topic,
        known(topic, topic, { type: 'days_mode', mode: 'at_checkout' }, row.sourceId),
      );
    }
    mark(
      topic,
      daysMode === 'not_stated' || row.daysMin === null || row.daysMax === null
        ? unknown(topic, topic)
        : known(topic, topic, { type: 'days', min: row.daysMin, max: row.daysMax }, row.sourceId),
    );
  };
  const cod = () => {
    const withCod = rows.filter((row) => row.cod !== null && row.cod !== undefined);
    const general = input.policy.cod;
    const fromGeneral = () =>
      general
        ? mark('cod', known('cod', 'cod', { type: 'bool', value: general.value }, general.sourceId))
        : mark('cod', unknown('cod', 'cod'));
    if (withCod.length === 0) return fromGeneral();
    const resolved = resolveRow(rows, input.location, (row) => String(row.cod ?? 'x'));
    if (resolved.kind === 'ask') {
      clarify = { ask: 'region' };
      facts.push(unknown('cod', 'cod'));
      return;
    }
    if (resolved.kind === 'unknown') return mark('cod', unknown('cod', 'cod'));
    const { row } = resolved;
    if (row.cod === null || row.cod === undefined) return fromGeneral();
    mark('cod', known('cod', 'cod', { type: 'bool', value: row.cod }, row.sourceId));
  };

  for (const topic of input.topics) {
    if (topic === 'ship_fee' || topic === 'ship_time') shipping(topic);
    else if (topic === 'ship_destination') destinationFact();
    else if (topic === 'cod') cod();
    else if (topic === 'defect') {
      // Hàng lỗi/sai hàng KHÔNG có chính sách riêng trong policy_facts (5 loại): mặc định chuyển người, không mượn số ngày/điều kiện của đổi trả do không vừa.
      // Ngoại lệ: thẻ bảo hành ĐÃ DUYỆT có phạm vi mà CODE khớp được với câu khách → nêu đúng bảo hành (phạm vi + thời hạn), nhưng bắt buộc người duyệt.
      const warranty = input.policy.warranty;
      if (
        warranty?.scope &&
        warranty.none !== true &&
        warranty.months !== null &&
        scopeMatches(warranty.scope, input.customerText ?? '')
      ) {
        mark('warranty', policyFact('warranty', input.policy));
        requiresHumanReview = true;
      } else {
        mark('defect', unknown('defect', 'defect'));
        handoff = true;
      }
    } else if (
      topic === 'returns' ||
      topic === 'refund_to' ||
      topic === 'return_shipping' ||
      topic === 'return_eligibility' ||
      topic === 'warranty' ||
      topic === 'payment'
    ) {
      mark(topic, policyFact(topic, input.policy));
    }
  }
  return {
    facts,
    clarify,
    unknownTopics: [...unknownTopics],
    issues,
    ...(handoff ? { handoff } : {}),
    ...(requiresHumanReview ? { requiresHumanReview } : {}),
  };
}
