import { describe, expect, it } from 'vitest';
import { checkSlotText, sameSlotSet, slotIds } from './slots';
import type { Fact, FactPlan } from './types';

const knownFact = (id: string, kind: Fact['kind']): Fact => ({
  id,
  kind,
  status: 'known',
  value: { type: 'text', text: 'x' },
  sourceId: 's',
});
const plan = (extra: Fact[] = []): FactPlan => ({
  facts: [
    knownFact('product_name.1', 'product_name'),
    knownFact('price.1', 'price'),
    knownFact('ship_fee', 'ship_fee'),
    knownFact('cod', 'cod'),
    { id: 'ship_time', kind: 'ship_time', status: 'unknown' },
    ...extra,
  ],
  clarify: null,
  unknownTopics: ['ship_time'],
  issues: [],
});
const codes = (text: string, p = plan()) => checkSlotText(text, p).violations.map((v) => v.code);

describe('slotIds', () => {
  it('lấy mã sự kiện theo thứ tự xuất hiện (kể cả lặp)', () => {
    expect(slotIds('{fact:price.1} và {fact:ship_fee}, lại {fact:price.1}')).toEqual([
      'price.1',
      'ship_fee',
      'price.1',
    ]);
    expect(slotIds('không có chỗ giữ chỗ')).toEqual([]);
  });
});

describe('checkSlotText — từ chối cứng mọi sự kiện ngoài chỗ giữ chỗ', () => {
  it('câu chỉ có chỗ giữ chỗ hợp lệ và lời văn → đạt', () => {
    expect(
      checkSlotText(
        '{fact:product_name.1} giá {fact:price.1}, ship {fact:ship_fee} bạn nhé!',
        plan(),
      ),
    ).toEqual({ ok: true, violations: [] });
  });

  it('chữ số ngoài chỗ giữ chỗ (giá, %, ngày, tên) → digit', () => {
    expect(codes('Áo giá 99.000đ bạn nhé')).toContain('digit');
    expect(codes('Giảm 10% hôm nay')).toContain('digit');
    expect(codes('Giao trong 2-4 ngày')).toContain('digit');
    expect(codes('Bản A4 cho bạn')).toContain('digit');
  });

  it('số viết bằng chữ cạnh đơn vị tiền/thời gian/phần trăm (vi, en) → number_word', () => {
    for (const text of [
      'Giao trong hai ngày',
      'Phí ba mươi nghìn đồng',
      'Bảo hành mười hai tháng',
      'Giảm năm phần trăm',
      'Delivery takes two days',
      'It costs thirty-five dollars',
      'Within one week',
      'Orders are processed within one business day',
      'Delivery takes two working weeks',
      'Giao trong ba ngày làm việc',
      'Giao trong một tới hai tuần',
    ]) {
      expect(codes(text)).toContain('number_word');
    }
  });

  it('đã biết: "one of our days" cũng bị bắt (số-chữ + 2 từ + đơn vị) — chấp nhận', () => {
    expect(codes('It happens one of our days')).toContain('number_word');
  });

  it('cách nói thường không có đơn vị KHÔNG bị chặn nhầm', () => {
    for (const text of [
      'Một chút nữa shop báo bạn nhé',
      'Hai bạn cứ chọn thoải mái',
      'Năm nay shop có mẫu mới',
      'Sau ngày hôm nay shop kiểm lại nhé',
      'One moment please',
      'Both of you are welcome',
      'One of our team will reply soon',
      'Hai bên cứ thoải mái trao đổi nhé',
    ]) {
      expect(codes(text)).toEqual([]);
    }
  });

  it('ký hiệu tiền tệ ngoài chỗ giữ chỗ → currency_symbol', () => {
    expect(codes('Giá chỉ $ thôi')).toContain('currency_symbol');
    expect(codes('Phí ₫ rẻ')).toContain('currency_symbol');
    expect(codes('giá rẻ đ nhé')).toContain('currency_symbol');
  });

  it('khẳng định có/không về khái niệm ngoài chỗ giữ chỗ (COD, đổi trả, bảo hành, trả góp…) → concept', () => {
    expect(codes('Shop có hỗ trợ COD bạn nhé')).toContain('concept');
    expect(codes('We offer a full refund')).toContain('concept');
    expect(codes('Sản phẩm được bảo hành dài hạn')).toContain('concept');
  });

  it('khái niệm nằm TRONG câu hỏi lại khách thì không bị chặn; chỗ giữ chỗ cod đi qua', () => {
    expect(codes('Bạn muốn thanh toán COD hay chuyển khoản?')).toEqual([]);
    expect(codes('Về thanh toán, shop {fact:cod} bạn nhé')).toEqual([]);
  });

  it('nêu TÊN khái niệm cạnh chỗ giữ chỗ cùng loại thì được ("Về đổi trả, {fact:returns}"); khác loại hoặc không có chỗ giữ chỗ thì vẫn bị chặn', () => {
    const withPolicy = plan([knownFact('returns', 'returns'), knownFact('warranty', 'warranty')]);
    expect(codes('Về đổi trả: {fact:returns}.', withPolicy)).toEqual([]);
    expect(codes('Về bảo hành, {fact:warranty} bạn nhé', withPolicy)).toEqual([]);
    expect(codes('Về đổi trả, shop có COD và {fact:ship_fee}', withPolicy)).toContain('concept');
    expect(codes('Shop nhận đổi trả, phí ship {fact:ship_fee}', withPolicy)).toContain('concept');
    expect(codes('Hoàn tiền cho bạn nhé, {fact:returns}', withPolicy)).toEqual([]);
  });

  it('mã sự kiện không có trong fact plan → unknown_slot; dùng sự kiện `unknown` → unknown_fact_used', () => {
    expect(codes('Phí {fact:bịa_ra}')).toEqual([]); // sai dạng mã: không phải chỗ giữ chỗ, chỉ là chữ thường
    expect(codes('Phí {fact:made_up} bạn nhé')).toContain('unknown_slot');
    expect(codes('Giao trong {fact:ship_time} bạn nhé')).toContain('unknown_fact_used');
  });

  it('vi phạm không chứa nội dung khách; mỗi mã chỉ báo một lần', () => {
    const result = checkSlotText('Giá 1 và 2 và 3', plan());
    expect(result.violations.filter((v) => v.code === 'digit')).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/Giá 1/);
  });
});

describe('sameSlotSet — mọi biến thể phải dùng cùng tập chỗ giữ chỗ', () => {
  it('bằng nhau theo tập (không phân biệt thứ tự/số lần lặp); khác → false', () => {
    expect(sameSlotSet(['a', 'b'], ['b', 'a', 'a'])).toBe(true);
    expect(sameSlotSet(['a'], ['a', 'b'])).toBe(false);
    expect(sameSlotSet([], [])).toBe(true);
  });
});

describe('checkSlotText — câu mời chỉ do code viết; không tự viết tình trạng hàng', () => {
  const plan: FactPlan = {
    facts: [
      {
        id: 'price.1',
        kind: 'price',
        status: 'known',
        value: { type: 'money', amountMinor: 1, currency: 'VND' },
        sourceId: 'p',
      },
      {
        id: 'stock.1',
        kind: 'stock',
        status: 'known',
        value: { type: 'stock', display: 'in' },
        sourceId: 'p',
      },
    ],
    clarify: null,
    unknownTopics: [],
    issues: [],
  };
  it.each([
    ['Giá {fact:price.1}, bạn inbox shop nhé.', 'invitation'],
    ['Giá {fact:price.1}. Please message us for details.', 'invitation'],
    ['Giá {fact:price.1}, bạn liên hệ shop để biết thêm.', 'invitation'],
    ['Price {fact:price.1}. Please contact us for more.', 'invitation'],
    ['Price {fact:price.1}. DM us anytime.', 'invitation'],
    ['{fact:price.1}, còn hàng bạn nhé.', 'stock_claim'],
    ['{fact:price.1}. It is in stock.', 'stock_claim'],
    ['{fact:price.1}. Sold out soon.', 'stock_claim'],
    ['{fact:price.1}. The item is available.', 'stock_claim'],
    ['{fact:price.1}. Still available!', 'stock_claim'],
    ['{fact:price.1}. Hiện còn sẵn nhé.', 'stock_claim'],
    ['{fact:price.1}. Available.', 'stock_claim'],
  ])('DƯƠNG: %s → %s', (text, code) => {
    expect(checkSlotText(text, plan).violations.map((v) => v.code)).toContain(code);
  });
  it.each([
    'Price {fact:price.1}, available in black or white.',
    'Price {fact:price.1}. Available shipping methods are shown at checkout.',
    'Price {fact:price.1}. Available options: S, M, L.',
    'Price {fact:price.1}; check availability soon.',
    'Price {fact:price.1}. Is it available in size M?',
    'Price {fact:price.1}, available for pre-order.',
    'Giá {fact:price.1}, bạn có thể liên hệ đơn vị vận chuyển để theo dõi.',
    'Price {fact:price.1}. Please contact the carrier for tracking.',
    'Giá {fact:price.1}, liên hệ hãng để bảo hành.',
    'Price {fact:price.1}. Reach out to the carrier.',
  ])('ÂM (không bắt nhầm): %s', (text) => {
    const codes = checkSlotText(text, plan).violations.map((v) => v.code);
    expect(codes).not.toContain('stock_claim');
    expect(codes).not.toContain('invitation');
  });
  it('dùng chỗ giữ chỗ tồn kho thì hợp lệ', () => {
    expect(checkSlotText('Giá {fact:price.1}, {fact:stock.1}.', plan).ok).toBe(true);
  });
});
