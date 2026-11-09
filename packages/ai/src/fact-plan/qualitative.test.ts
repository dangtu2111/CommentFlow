import { parsePolicyFactData } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { countryName, resolvePlace } from './destinations';
import { fillSlots } from './fill';
import { buildFactPlan } from './plan';
import { policyFactsFromRows } from './policy-rows';
import { suggestPolicyFacts } from './suggest';
import type { FactPlanInput, PolicyFacts, ShipRow } from './types';

const SHIPPING_TEXT = [
  'Shipping Methods & Delivery Times',
  'Available shipping methods and estimated delivery times are shown at checkout.',
  'Shipping costs',
  'Shipping charges are calculated at checkout based on your destination, order weight, and selected shipping method. Free standard shipping may be available on selected orders as displayed at checkout.',
  'Shipping destinations',
  'We currently ship to United States.',
].join('\n');

const REFUND_TEXT = [
  'Return eligibility depends on the items in your order.',
  'Unless we state otherwise or applicable law requires otherwise, you are responsible for return shipping costs for change-of-mind returns.',
  'If approved, you will be refunded to your original payment method, unless otherwise stated.',
].join('\n');

describe('resolvePlace — tiểu bang/lãnh thổ Mỹ ∈ US, quốc gia khác theo mã ISO', () => {
  it.each([
    ['Hawaii', 'US'],
    ['do you ship to Texas', 'US'],
    ['Canada', 'CA'],
    ['ship sang Úc', 'AU'],
    ['Hà Nội', 'VN'],
    ['gửi tới Nhật Bản', 'JP'],
  ])('%s → %s', (text, code) => {
    expect(resolvePlace(text)?.country).toBe(code);
  });
  it('không nhận ra hoặc nêu nhiều quốc gia → null; từ ngắn mơ hồ cần từ chỉ nơi', () => {
    expect(resolvePlace('Atlantis')).toBeNull();
    expect(resolvePlace('Canada or Mexico')).toBeNull();
    expect(resolvePlace('my order is late')).toBeNull();
    expect(resolvePlace('ship to us')?.country).toBe('US');
  });
  it('tên quốc gia theo ngôn ngữ', () => {
    expect(countryName('US', 'en')).toBe('the United States');
    expect(countryName('US', 'vi')).toBe('Mỹ');
    expect(countryName('ZZ', 'en')).toBe('ZZ');
  });
});

describe('suggest định tính (#294 rút ENUM khi cụm nguyên văn xuất hiện)', () => {
  it('ship: destinations + feeMode at_checkout + daysMode at_checkout từ văn bản vận chuyển', () => {
    const ship = suggestPolicyFacts(SHIPPING_TEXT).find((s) => s.kind === 'ship_region');
    expect(ship?.data).toMatchObject({
      kind: 'nationwide',
      label: 'United States',
      destinations: ['US'],
      feeMode: 'at_checkout',
      daysMode: 'at_checkout',
      feeMinor: null,
      currency: 'USD',
    });
    expect(parsePolicyFactData('ship_region', ship?.data).success).toBe(true);
    expect(ship?.evidence).toContain('We currently ship to United States.');
  });
  it('"free shipping may be available" (có điều kiện) KHÔNG thành feeMode free', () => {
    const ship = suggestPolicyFacts(
      'We currently ship to United States. Free standard shipping may be available.',
    ).find((s) => s.kind === 'ship_region');
    expect((ship?.data as { feeMode?: string } | undefined)?.feeMode).toBeUndefined();
  });
  it('returns: refundTo, returnShippingPaidBy, eligibility từ văn bản đổi trả', () => {
    const ret = suggestPolicyFacts(REFUND_TEXT).find((s) => s.kind === 'returns');
    expect(ret?.data).toEqual({
      days: null,
      refundTo: 'original_payment',
      returnShippingPaidBy: 'customer_change_of_mind',
      eligibility: 'varies_by_item',
    });
    expect(parsePolicyFactData('returns', ret?.data).success).toBe(true);
  });
  it('gộp enum vào dòng đổi trả đã có số ngày', () => {
    const ret = suggestPolicyFacts(`Đổi trả trong 7 ngày. ${REFUND_TEXT}`).find(
      (s) => s.kind === 'returns',
    );
    expect(ret?.data).toMatchObject({ days: 7, refundTo: 'original_payment' });
  });
  it('cửa hàng shop trả phí ship khi trả hàng', () => {
    const ret = suggestPolicyFacts('We cover return shipping for all returns within 30 days.').find(
      (s) => s.kind === 'returns',
    );
    expect(ret?.data).toMatchObject({ returnShippingPaidBy: 'shop' });
  });
});

const usRow: ShipRow = {
  kind: 'nationwide',
  label: 'United States',
  feeMinor: null,
  currency: 'USD',
  daysMin: null,
  daysMax: null,
  feeMode: 'at_checkout',
  daysMode: 'at_checkout',
  destinations: ['US'],
  sourceId: 'pf:us',
};
const policy: PolicyFacts = {
  shipping: [usRow],
  returns: {
    days: null,
    refundTo: 'original_payment',
    returnShippingPaidBy: 'customer_change_of_mind',
    eligibility: 'varies_by_item',
    sourceId: 'pf:ret',
  },
};
const plan = (over: Partial<FactPlanInput>) =>
  buildFactPlan({
    products: [],
    topics: [],
    policy,
    stock: { disclose: 'status', lowAt: null },
    ...over,
  });
const fill = (text: string, p: ReturnType<typeof plan>, lang: 'vi' | 'en' = 'en') =>
  fillSlots(text, p, { lang });

describe('fact plan định tính — known khi có giá trị định tính, kể cả không có số', () => {
  it('ship_destination: Hawaii ∈ US → known ok; Canada → known "hiện giao tới Mỹ" (không phủ định)', () => {
    const hawaii = plan({ topics: ['ship_destination'], destination: resolvePlace('Hawaii') });
    expect(fill('{fact:ship_destination}.', hawaii).text).toBe('we ship to the United States.');
    const canada = plan({ topics: ['ship_destination'], destination: resolvePlace('Canada') });
    expect(fill('{fact:ship_destination}.', canada).text).toBe(
      'we currently ship to the United States.',
    );
    expect(fill('{fact:ship_destination}.', canada, 'vi').text).toBe('hiện shop giao tới Mỹ.');
    expect(plan({ topics: ['ship_destination'], destination: null }).facts[0]?.status).toBe(
      'unknown',
    );
    expect(
      buildFactPlan({
        products: [],
        topics: ['ship_destination'],
        policy: { shipping: [] },
        destination: resolvePlace('Hawaii'),
        stock: { disclose: 'status', lowAt: null },
      }).facts[0]?.status,
    ).toBe('unknown');
  });
  it('ship_fee at_checkout / ship_time at_checkout → known, không có số', () => {
    const p = plan({ topics: ['ship_fee', 'ship_time'], destination: resolvePlace('Texas') });
    expect(p.unknownTopics).toEqual([]);
    expect(fill('Fee: {fact:ship_fee}. Time: {fact:ship_time}.', p).text).toBe(
      'Fee: calculated at checkout based on your destination and shipping method. Time: shown at checkout.',
    );
    expect(fill('{fact:ship_fee}; {fact:ship_time}', p, 'vi').text).toBe(
      'được tính khi thanh toán, tùy địa chỉ nhận và hình thức giao; hiển thị khi thanh toán',
    );
  });
  it('feeMode free / free_over', () => {
    const free = plan({
      topics: ['ship_fee'],
      policy: { shipping: [{ ...usRow, feeMode: 'free' }] },
    });
    expect(fill('{fact:ship_fee}', free).text).toBe('free');
    const over = plan({
      topics: ['ship_fee'],
      policy: { shipping: [{ ...usRow, feeMode: 'free_over', freeOverMinor: 5000 }] },
    });
    expect(fill('{fact:ship_fee}', over).text).toBe('free on orders over $50.00');
    expect(fill('{fact:ship_fee}', over, 'vi').text).toBe('miễn phí cho đơn từ $50,00');
    const broken = plan({
      topics: ['ship_fee'],
      policy: { shipping: [{ ...usRow, feeMode: 'free_over' }] },
    });
    expect(broken.facts[0]?.status).toBe('unknown');
  });
  it('returns định tính: refund_to, return_shipping, return_eligibility', () => {
    const p = plan({ topics: ['refund_to', 'return_shipping', 'return_eligibility'] });
    expect(
      fill('{fact:refund_to}; {fact:return_shipping}; {fact:return_eligibility}', p).text,
    ).toBe(
      'refunds go back to the original payment method; for change-of-mind returns, the customer pays return shipping; whether an item can be returned depends on the item',
    );
    expect(
      fill('{fact:refund_to}; {fact:return_shipping}; {fact:return_eligibility}', p, 'vi').text,
    ).toBe(
      'hoàn tiền về phương thức thanh toán ban đầu; nếu đổi ý, khách chịu phí ship khi trả hàng; khả năng đổi trả tùy từng sản phẩm',
    );
    const shop = plan({
      topics: ['return_shipping'],
      policy: {
        shipping: [],
        returns: { days: null, returnShippingPaidBy: 'shop', sourceId: 'x' },
      },
    });
    expect(fill('{fact:return_shipping}', shop).text).toBe('we cover return shipping');
    expect(fill('{fact:return_shipping}', shop, 'vi').text).toBe('shop chịu phí ship khi trả hàng');
    const none = plan({
      topics: ['refund_to', 'return_shipping', 'return_eligibility'],
      policy: { shipping: [] },
    });
    expect(none.facts.every((f) => f.status === 'unknown')).toBe(true);
  });
  it('defect: luôn unknown + handoff (không mượn số ngày/điều kiện đổi trả); policy-rows nhận enum', () => {
    const p = plan({ topics: ['defect'] });
    expect(p.handoff).toBe(true);
    expect(p.facts[0]?.status).toBe('unknown');
    const { policy: fromRows } = policyFactsFromRows([
      {
        id: 'r',
        kind: 'returns',
        status: 'approved',
        data: { days: null, refundTo: 'original_payment', eligibility: 'varies_by_item' },
      },
      {
        id: 's',
        kind: 'ship_region',
        status: 'approved',
        data: {
          kind: 'nationwide',
          label: 'United States',
          feeMinor: null,
          currency: 'USD',
          daysMin: null,
          daysMax: null,
          feeMode: 'at_checkout',
          daysMode: 'at_checkout',
          destinations: ['US'],
        },
      },
    ]);
    expect(fromRows.returns).toMatchObject({
      refundTo: 'original_payment',
      eligibility: 'varies_by_item',
    });
    expect(fromRows.shipping[0]).toMatchObject({
      feeMode: 'at_checkout',
      daysMode: 'at_checkout',
      destinations: ['US'],
    });
  });
  it('dòng ship nhiều quốc gia: chỉ xét dòng giao tới quốc gia khách hỏi; không có dòng → unknown', () => {
    const vn: ShipRow = {
      kind: 'nationwide',
      label: 'Toàn quốc',
      feeMinor: 30000,
      currency: 'VND',
      daysMin: 2,
      daysMax: 4,
      sourceId: 'pf:vn',
    };
    const p = plan({
      topics: ['ship_fee'],
      policy: { shipping: [vn, usRow] },
      destination: resolvePlace('Texas'),
    });
    expect(fill('{fact:ship_fee}', p).text).toContain('calculated at checkout');
    const none = plan({
      topics: ['ship_fee'],
      policy: { shipping: [vn] },
      destination: resolvePlace('Texas'),
    });
    expect(none.facts[0]?.status).toBe('unknown');
  });
});

describe('schema Zod — định tính', () => {
  it('feeMode/daysMode/destinations/returns enums', () => {
    const base = {
      kind: 'nationwide',
      label: 'US',
      feeMinor: null,
      currency: 'USD',
      daysMin: null,
      daysMax: null,
    };
    expect(
      parsePolicyFactData('ship_region', {
        ...base,
        feeMode: 'at_checkout',
        daysMode: 'at_checkout',
        destinations: ['US'],
      }).success,
    ).toBe(true);
    expect(parsePolicyFactData('ship_region', { ...base, feeMode: 'fixed' }).success).toBe(false);
    expect(parsePolicyFactData('ship_region', { ...base, feeMode: 'free_over' }).success).toBe(
      false,
    );
    expect(
      parsePolicyFactData('ship_region', { ...base, feeMode: 'free_over', freeOverMinor: 5000 })
        .success,
    ).toBe(true);
    expect(parsePolicyFactData('ship_region', { ...base, destinations: ['usa'] }).success).toBe(
      false,
    );
    expect(
      parsePolicyFactData('returns', { days: null, refundTo: 'original_payment' }).success,
    ).toBe(true);
    expect(parsePolicyFactData('returns', { days: null }).success).toBe(false);
    expect(
      parsePolicyFactData('returns', { days: null, returnShippingPaidBy: 'someone' }).success,
    ).toBe(false);
  });
});

describe('suggest — dòng ship có số thì KHÔNG tạo thêm dòng định tính', () => {
  it('đã có ship_region từ câu có số → giữ một dòng', () => {
    const rows = suggestPolicyFacts(
      'Phí ship toàn quốc 30.000đ, giao trong 2-4 ngày. We currently ship to United States.',
    ).filter((s) => s.kind === 'ship_region');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toMatchObject({ feeMinor: 30000 });
  });
});
