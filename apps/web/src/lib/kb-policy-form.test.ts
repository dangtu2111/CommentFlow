import { describe, expect, it } from 'vitest';
import {
  formToPolicyData,
  isEditableKind,
  parseWholeNumber,
  policyFormDefaults,
  splitItems,
} from './kb-policy-form';

const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
};

describe('parseWholeNumber / splitItems / isEditableKind', () => {
  it('đọc số tiền kiểu Việt; rỗng hoặc sai → null', () => {
    expect(parseWholeNumber('30.000')).toBe(30000);
    expect(parseWholeNumber('30,000đ')).toBe(30000);
    expect(parseWholeNumber(' 7 ')).toBe(7);
    expect(parseWholeNumber('')).toBeNull();
    expect(parseWholeNumber('abc')).toBeNull();
    expect(parseWholeNumber('-5')).toBeNull();
    expect(parseWholeNumber('9'.repeat(30))).toBeNull();
  });
  it('tách mục theo dòng/dấu phẩy, bỏ trống và trùng', () => {
    expect(splitItems('a, b\nb;c\n\n')).toEqual(['a', 'b', 'c']);
  });
  it('chỉ 4 loại có biểu mẫu', () => {
    expect(isEditableKind('returns')).toBe(true);
    expect(isEditableKind('cod')).toBe(true);
    expect(isEditableKind('cash')).toBe(false);
    expect(isEditableKind(5)).toBe(false);
  });
});

describe('formToPolicyData — ship_region', () => {
  const base = {
    kind: 'ship_region',
    label: 'Toàn quốc',
    regionKind: 'nationwide',
    feeMode: 'fixed',
    feeAmount: '30.000',
    daysMode: 'range',
    daysMin: '2',
    daysMax: '4',
    cod: 'yes',
    destinations: 'vn',
  };
  it('phí cố định + khoảng ngày + COD có → data đúng, slot = nhãn chuẩn hóa', () => {
    const out = formToPolicyData(form(base));
    expect(out).toMatchObject({ ok: true, kind: 'ship_region', slot: 'toan quoc' });
    expect(out.ok && out.data).toMatchObject({
      kind: 'nationwide',
      feeMode: 'fixed',
      feeMinor: 30000,
      currency: 'VND',
      daysMin: 2,
      daysMax: 4,
      cod: true,
      destinations: ['VN'],
    });
  });
  it('miễn phí → feeMinor 0; tính khi thanh toán → feeMinor null và không cần số ngày', () => {
    const free = formToPolicyData(form({ ...base, feeMode: 'free', feeAmount: '' }));
    expect(free.ok && free.data).toMatchObject({ feeMode: 'free', feeMinor: 0 });
    const checkout = formToPolicyData(
      form({
        ...base,
        feeMode: 'at_checkout',
        feeAmount: '',
        daysMode: 'at_checkout',
        cod: 'unknown',
      }),
    );
    expect(checkout.ok && checkout.data).toMatchObject({
      feeMode: 'at_checkout',
      feeMinor: null,
      daysMode: 'at_checkout',
      daysMin: null,
      cod: null,
    });
  });
  it('miễn phí từ ngưỡng: cần ngưỡng; thiếu → sai', () => {
    const ok = formToPolicyData(
      form({ ...base, feeMode: 'free_over', feeAmount: '20000', freeOverAmount: '500.000' }),
    );
    expect(ok.ok && ok.data).toMatchObject({
      feeMode: 'free_over',
      freeOverMinor: 500000,
      feeMinor: 20000,
    });
    expect(formToPolicyData(form({ ...base, feeMode: 'free_over', freeOverAmount: '' }))).toEqual({
      ok: false,
    });
  });
  it('nội thành cần thành phố; vùng cần tỉnh/thành; ngày tối đa < tối thiểu → sai', () => {
    expect(formToPolicyData(form({ ...base, regionKind: 'city', city: '' }))).toEqual({
      ok: false,
    });
    const city = formToPolicyData(form({ ...base, regionKind: 'city', city: 'Hà Nội' }));
    expect(city.ok && city.data).toMatchObject({ kind: 'city', city: 'Hà Nội' });
    const region = formToPolicyData(
      form({ ...base, regionKind: 'region', places: 'Hà Nội, Hải Phòng' }),
    );
    expect(region.ok && region.data).toMatchObject({ places: ['Hà Nội', 'Hải Phòng'] });
    expect(formToPolicyData(form({ ...base, regionKind: 'region', places: '' }))).toEqual({
      ok: false,
    });
    expect(formToPolicyData(form({ ...base, daysMin: '5', daysMax: '2' }))).toEqual({ ok: false });
  });
  it('thiếu nhãn hoặc loại lạ → sai', () => {
    expect(formToPolicyData(form({ ...base, label: '' }))).toEqual({ ok: false });
    expect(formToPolicyData(form({ ...base, kind: 'cash' }))).toEqual({ ok: false });
    expect(formToPolicyData(form({}))).toEqual({ ok: false });
  });
});

describe('formToPolicyData — returns / warranty / payment', () => {
  it('đổi trả: số ngày + điều kiện + hoàn tiền + ai chịu phí + khả năng', () => {
    const out = formToPolicyData(
      form({
        kind: 'returns',
        days: '7',
        conditions: 'Còn tem mác\nChưa giặt',
        refundTo: 'original_payment',
        returnShippingPaidBy: 'shop',
        eligibility: 'varies_by_item',
      }),
    );
    expect(out).toMatchObject({ ok: true, slot: 'returns' });
    expect(out.ok && out.data).toMatchObject({
      days: 7,
      conditions: ['Còn tem mác', 'Chưa giặt'],
      refundTo: 'original_payment',
      returnShippingPaidBy: 'shop',
      eligibility: 'varies_by_item',
    });
  });
  it('đổi trả "không áp dụng"; không số ngày và không trường nào → sai', () => {
    const none = formToPolicyData(form({ kind: 'returns', none: 'on' }));
    expect(none.ok && none.data).toMatchObject({ none: true, days: null });
    expect(formToPolicyData(form({ kind: 'returns' }))).toEqual({ ok: false });
    const qualitative = formToPolicyData(form({ kind: 'returns', refundTo: 'original_payment' }));
    expect(qualitative.ok).toBe(true);
  });
  it('bảo hành: tháng + phạm vi; "không bảo hành"; thiếu cả hai → sai', () => {
    const w = formToPolicyData(form({ kind: 'warranty', months: '3', scope: 'đường may' }));
    expect(w.ok && w.data).toMatchObject({ months: 3, scope: 'đường may' });
    const none = formToPolicyData(form({ kind: 'warranty', none: 'on', months: '12' }));
    expect(none.ok && none.data).toMatchObject({ none: true, months: null });
    expect(formToPolicyData(form({ kind: 'warranty' }))).toEqual({ ok: false });
  });
  it('thanh toán: lấy phương thức hợp lệ theo thứ tự chuẩn; rỗng → sai', () => {
    const out = formToPolicyData(form({ kind: 'payment', methods: ['bank_transfer', 'cod', 'x'] }));
    expect(out.ok && out.data).toEqual({ methods: ['cod', 'bank_transfer'] });
    expect(formToPolicyData(form({ kind: 'payment' }))).toEqual({ ok: false });
  });
});

describe('policyFormDefaults', () => {
  it('ship: suy chế độ phí/ngày từ dữ liệu cũ; mặc định khi thêm mới', () => {
    const fromOld = policyFormDefaults('ship_region', {
      kind: 'city',
      label: 'Nội thành Hà Nội',
      city: 'Hà Nội',
      currency: 'VND',
      feeMinor: 20000,
      daysMin: 1,
      daysMax: 2,
      cod: false,
      destinations: ['VN', 'US'],
    });
    expect(fromOld).toMatchObject({
      regionKind: 'city',
      feeMode: 'fixed',
      feeAmount: '20000',
      daysMode: 'range',
      cod: 'no',
      destinations: 'VN, US',
    });
    const fresh = policyFormDefaults('ship_region', null);
    expect(fresh).toMatchObject({
      regionKind: 'nationwide',
      feeMode: 'fixed',
      daysMode: 'not_stated',
      cod: 'unknown',
      destinations: 'VN',
    });
    const free = policyFormDefaults('ship_region', {
      kind: 'region',
      places: ['A', 'B'],
      feeMode: 'free',
      feeMinor: 0,
      currency: 'VND',
      daysMin: null,
      daysMax: null,
    });
    expect(free).toMatchObject({ feeMode: 'free', feeAmount: '', places: 'A\nB' });
  });
  it('đổi trả / bảo hành / thanh toán', () => {
    expect(
      policyFormDefaults('returns', {
        days: 7,
        conditions: ['a', 'b'],
        refundTo: 'original_payment',
      }),
    ).toMatchObject({ days: '7', conditions: 'a\nb', refundTo: 'original_payment', none: '' });
    expect(policyFormDefaults('returns', { days: null, none: true })).toMatchObject({ none: 'on' });
    expect(policyFormDefaults('warranty', { months: 3, scope: 'x' })).toMatchObject({
      months: '3',
      scope: 'x',
      none: '',
    });
    expect(policyFormDefaults('warranty', { months: null, none: true })).toMatchObject({
      none: 'on',
    });
    expect(policyFormDefaults('payment', { methods: ['cod'] })).toEqual({ methods: ['cod'] });
    expect(policyFormDefaults('payment', null)).toEqual({ methods: [] });
  });
});

describe('COD chung', () => {
  it('đọc form COD: Có / Không → { value }; slot = cod', () => {
    const yes = formToPolicyData(form({ kind: 'cod', codValue: 'yes' }));
    expect(yes).toMatchObject({ ok: true, slot: 'cod', data: { value: true } });
    const no = formToPolicyData(form({ kind: 'cod', codValue: 'no' }));
    expect(no.ok && no.data).toEqual({ value: false });
  });
  it('giá trị mặc định: có mặc định "yes", false → "no"', () => {
    expect(policyFormDefaults('cod', { value: false })).toEqual({ codValue: 'no' });
    expect(policyFormDefaults('cod', { value: true })).toEqual({ codValue: 'yes' });
    expect(policyFormDefaults('cod', null)).toEqual({ codValue: 'yes' });
  });
});
