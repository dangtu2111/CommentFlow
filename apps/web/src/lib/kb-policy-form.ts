import {
  PAYMENT_METHODS,
  type PolicyFactKind,
  parsePolicyFactData,
  policySlotOf,
} from '@flow/shared';

/**
 * Biểu mẫu Sửa tay / Thêm giá trị chính sách có cấu trúc (ADR 017): chuyển `FormData` thành `data` đã kiểm bằng Zod của `@flow/shared` (nguồn sự thật duy nhất; `parsePolicyFactData`),
 * và ngược lại tạo giá trị mặc định cho biểu mẫu từ `data` đang có. Thuần, không đọc DB/phiên. Mọi giá trị chỉ là DỮ LIỆU: workspace/người dùng lấy từ phiên ở Server Action.
 * Chỉ nhận 4 loại hiển thị ở trang (ship_region, returns, warranty, payment); COD chung (`cod`) không có biểu mẫu riêng.
 */
export const EDITABLE_KINDS = ['ship_region', 'returns', 'warranty', 'payment'] as const;
export type EditableKind = (typeof EDITABLE_KINDS)[number];

export const isEditableKind = (value: unknown): value is EditableKind =>
  typeof value === 'string' && (EDITABLE_KINDS as readonly string[]).includes(value);

export type PolicyFormParse =
  | { ok: true; kind: PolicyFactKind; slot: string; data: unknown }
  | { ok: false };

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

/** Số nguyên không âm từ chữ người nhập ("30.000", "30,000", "30000đ"); rỗng hoặc sai → `null`. */
export function parseWholeNumber(value: string): number | null {
  const digits = value.replace(/[\s.,đĐ₫]/g, '');
  if (digits === '' || !/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** Mỗi dòng (hoặc cách nhau bằng dấu phẩy/chấm phẩy) một mục; bỏ mục trống và trùng. */
export function splitItems(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\r\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function shipData(data: FormData): Record<string, unknown> {
  const kind = text(data, 'regionKind');
  const feeMode = text(data, 'feeMode');
  const daysMode = text(data, 'daysMode');
  const cod = text(data, 'cod');
  const places = splitItems(text(data, 'places'));
  const destinations = splitItems(text(data, 'destinations').toUpperCase());
  const feeAmount = parseWholeNumber(text(data, 'feeAmount'));
  const freeOver = parseWholeNumber(text(data, 'freeOverAmount'));
  return {
    kind,
    label: text(data, 'label'),
    ...(kind === 'city' ? { city: text(data, 'city') } : {}),
    ...(kind === 'region' ? { places } : {}),
    currency: text(data, 'currency') || 'VND',
    feeMode,
    feeMinor: feeMode === 'free' ? 0 : feeMode === 'at_checkout' ? null : feeAmount,
    ...(feeMode === 'free_over' ? { freeOverMinor: freeOver } : {}),
    daysMode,
    daysMin: daysMode === 'range' ? parseWholeNumber(text(data, 'daysMin')) : null,
    daysMax: daysMode === 'range' ? parseWholeNumber(text(data, 'daysMax')) : null,
    cod: cod === 'yes' ? true : cod === 'no' ? false : null,
    ...(destinations.length > 0 ? { destinations } : {}),
  };
}

function returnsData(data: FormData): Record<string, unknown> {
  const none = data.get('none') === 'on';
  const conditions = splitItems(text(data, 'conditions').replace(/;/g, '\n'));
  const refundTo = text(data, 'refundTo');
  const paidBy = text(data, 'returnShippingPaidBy');
  const eligibility = text(data, 'eligibility');
  return {
    days: none ? null : parseWholeNumber(text(data, 'days')),
    ...(none ? { none: true } : {}),
    ...(conditions.length > 0 ? { conditions } : {}),
    refundTo: refundTo === '' ? null : refundTo,
    returnShippingPaidBy: paidBy === '' ? null : paidBy,
    eligibility: eligibility === '' ? null : eligibility,
  };
}

function warrantyData(data: FormData): Record<string, unknown> {
  const none = data.get('none') === 'on';
  const scope = text(data, 'scope');
  return {
    months: none ? null : parseWholeNumber(text(data, 'months')),
    ...(none ? { none: true } : {}),
    ...(scope !== '' ? { scope } : {}),
  };
}

function paymentData(data: FormData): Record<string, unknown> {
  const picked = data
    .getAll('methods')
    .filter((value): value is string => typeof value === 'string');
  return { methods: PAYMENT_METHODS.filter((method) => picked.includes(method)) };
}

/** Đọc form → `data` đã kiểm Zod + `slot` (dòng ship = nhãn chuẩn hóa; loại khác = `kind`). Sai cấu trúc → `{ ok: false }`. */
export function formToPolicyData(data: FormData): PolicyFormParse {
  const kind = text(data, 'kind');
  if (!isEditableKind(kind)) return { ok: false };
  const raw =
    kind === 'ship_region'
      ? shipData(data)
      : kind === 'returns'
        ? returnsData(data)
        : kind === 'warranty'
          ? warrantyData(data)
          : paymentData(data);
  const parsed = parsePolicyFactData(kind, raw);
  if (!parsed.success) return { ok: false };
  const slot = policySlotOf(kind, parsed.data as { label?: string });
  if (slot === '') return { ok: false };
  return { ok: true, kind, slot, data: parsed.data };
}

export type PolicyFormDefaults = Record<string, string | string[]>;

const str = (value: unknown): string =>
  typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';

/** Giá trị mặc định cho biểu mẫu từ `data` đang có (hoặc rỗng khi thêm mới). `data` đã qua Zod ở ranh giới đọc. */
export function policyFormDefaults(kind: EditableKind, data: unknown): PolicyFormDefaults {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (kind === 'ship_region') {
    const feeMode =
      str(d.feeMode) || (d.feeMinor === null || d.feeMinor === undefined ? '' : 'fixed');
    const daysMode =
      str(d.daysMode) || (d.daysMin === null || d.daysMin === undefined ? 'not_stated' : 'range');
    return {
      label: str(d.label),
      regionKind: str(d.kind) || 'nationwide',
      city: str(d.city),
      places: Array.isArray(d.places) ? d.places.map(str).join('\n') : '',
      currency: str(d.currency) || 'VND',
      feeMode: feeMode || 'fixed',
      feeAmount: feeMode === 'free' ? '' : str(d.feeMinor),
      freeOverAmount: str(d.freeOverMinor),
      daysMode,
      daysMin: str(d.daysMin),
      daysMax: str(d.daysMax),
      cod: d.cod === true ? 'yes' : d.cod === false ? 'no' : 'unknown',
      destinations: Array.isArray(d.destinations) ? d.destinations.map(str).join(', ') : 'VN',
    };
  }
  if (kind === 'returns') {
    return {
      days: str(d.days),
      none: d.none === true ? 'on' : '',
      conditions: Array.isArray(d.conditions) ? d.conditions.map(str).join('\n') : '',
      refundTo: str(d.refundTo),
      returnShippingPaidBy: str(d.returnShippingPaidBy),
      eligibility: str(d.eligibility),
    };
  }
  if (kind === 'warranty') {
    return { months: str(d.months), none: d.none === true ? 'on' : '', scope: str(d.scope) };
  }
  return { methods: Array.isArray(d.methods) ? d.methods.map(str) : [] };
}
