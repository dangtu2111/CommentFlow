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
  const stock = variant === null ? product.stock : variant.stock;
  if (product.stockStale === true || stock === null) return unknown(id, 'stock');
  const sourceId = product.id;
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

function policyFact(topic: 'returns' | 'warranty' | 'payment', policy: PolicyFacts): Fact {
  if (topic === 'returns') {
    const r = policy.returns;
    if (!r) return unknown('returns', 'returns');
    if (r.none === true) return known('returns', 'returns', { type: 'none' }, r.sourceId);
    return r.days === null
      ? unknown('returns', 'returns')
      : known('returns', 'returns', { type: 'days_count', n: r.days }, r.sourceId);
  }
  if (topic === 'warranty') {
    const w = policy.warranty;
    if (!w) return unknown('warranty', 'warranty');
    if (w.none === true) return known('warranty', 'warranty', { type: 'none' }, w.sourceId);
    return w.months === null
      ? unknown('warranty', 'warranty')
      : known('warranty', 'warranty', { type: 'months_count', n: w.months }, w.sourceId);
  }
  const p = policy.payment;
  return p
    ? known('payment', 'payment', { type: 'methods', methods: p.methods }, p.sourceId)
    : unknown('payment', 'payment');
}

export function buildFactPlan(input: FactPlanInput): FactPlan {
  const facts: Fact[] = [];
  const unknownTopics = new Set<FactTopic>();
  const issues: string[] = [];
  let clarify: FactPlan['clarify'] = null;
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
    if (chosen !== null && input.topics.some((t) => t === 'price' || t === 'stock')) {
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
  const shipping = (topic: 'ship_fee' | 'ship_time') => {
    const signature = (row: ShipRow) =>
      `${row.feeMinor}|${row.daysMin}|${row.daysMax}|${row.currency}`;
    const resolved = resolveRow(rows, input.location, signature);
    if (resolved.kind === 'ask') {
      clarify = { ask: 'region' };
      facts.push(unknown(topic, topic));
      return;
    }
    if (resolved.kind === 'unknown') return mark(topic, unknown(topic, topic));
    const { row } = resolved;
    if (topic === 'ship_fee') {
      return mark(
        topic,
        row.feeMinor === null
          ? unknown(topic, topic)
          : known(
              topic,
              topic,
              { type: 'money', amountMinor: row.feeMinor, currency: row.currency },
              row.sourceId,
            ),
      );
    }
    mark(
      topic,
      row.daysMin === null || row.daysMax === null
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
    else if (topic === 'cod') cod();
    else if (topic === 'returns' || topic === 'warranty' || topic === 'payment') {
      mark(topic, policyFact(topic, input.policy));
    }
  }
  return { facts, clarify, unknownTopics: [...unknownTopics], issues };
}
