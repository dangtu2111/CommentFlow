import { describe, expect, it } from 'vitest';
import { fillSlots, formatMoney } from './fill';
import type { Fact, FactPlan, FactValue } from './types';

const fact = (id: string, kind: Fact['kind'], value: FactValue, sourceId = `src:${id}`): Fact => ({
  id,
  kind,
  status: 'known',
  value,
  sourceId,
});
const planOf = (...facts: Fact[]): FactPlan => ({
  facts,
  clarify: null,
  unknownTopics: [],
  issues: [],
});
const fill = (text: string, p: FactPlan, lang: 'vi' | 'en' = 'vi') => fillSlots(text, p, { lang });

describe('formatMoney — theo tiền tệ của sản phẩm; ngôn ngữ chỉ quyết định dấu phân cách', () => {
  it('VND: nghìn bằng dấu chấm (vi) / phẩy (en), hậu tố đ', () => {
    expect(formatMoney({ amountMinor: 99000, currency: 'VND' }, 'vi')).toBe('99.000đ');
    expect(formatMoney({ amountMinor: 1250000, currency: 'VND' }, 'en')).toBe('1,250,000đ');
    expect(formatMoney({ amountMinor: 500, currency: 'VND' }, 'vi')).toBe('500đ');
  });
  it('USD: ký hiệu $, thập phân đúng số chữ số; vi dùng dấu phẩy thập phân, en dùng dấu chấm', () => {
    expect(formatMoney({ amountMinor: 5890, currency: 'USD' }, 'en')).toBe('$58.90');
    expect(formatMoney({ amountMinor: 5890, currency: 'USD' }, 'vi')).toBe('$58,90');
    expect(formatMoney({ amountMinor: 118900, currency: 'USD' }, 'en')).toBe('$1,189.00');
    expect(formatMoney({ amountMinor: 118900, currency: 'USD' }, 'vi')).toBe('$1.189,00');
    expect(formatMoney({ amountMinor: 7, currency: 'USD' }, 'en')).toBe('$0.07');
  });
  it('tiền tệ khác: ký hiệu nếu biết, không thì mã ISO; tiền tệ 0 chữ số thập phân', () => {
    expect(formatMoney({ amountMinor: 1500, currency: 'JPY' }, 'en')).toBe('¥1,500');
    expect(formatMoney({ amountMinor: 1234, currency: 'EUR' }, 'en')).toBe('€12.34');
    expect(formatMoney({ amountMinor: 1234, currency: 'CHF' }, 'en')).toBe('12.34 CHF');
  });
  it('tiền tệ hỏng dạng → null (không bịa)', () => {
    expect(formatMoney({ amountMinor: 100, currency: 'usd' }, 'en')).toBeNull();
    expect(formatMoney({ amountMinor: -5, currency: 'VND' }, 'vi')).toBeNull();
  });
});

describe('fillSlots', () => {
  const p = planOf(
    fact(
      'product_name.1',
      'product_name',
      { type: 'text', text: '14-in-1 Foldable Bench A4' },
      'p1',
    ),
    fact('price.1', 'price', { type: 'money', amountMinor: 39800, currency: 'USD' }, 'p1'),
    fact(
      'price_range.1',
      'price_range',
      { type: 'money_range', minMinor: 150000, maxMinor: 160000, currency: 'VND' },
      'p1',
    ),
    fact('ship_fee', 'ship_fee', { type: 'money', amountMinor: 20000, currency: 'VND' }, 'kb:ship'),
    fact('ship_time', 'ship_time', { type: 'days', min: 2, max: 4 }, 'kb:ship'),
    fact('customer_measure.1', 'customer_measure', { type: 'text', text: '1m58' }, 'customer'),
  );

  it('điền đúng giá trị; tên sản phẩm có chữ số giữ NGUYÊN VĂN', () => {
    const out = fill(
      '{fact:product_name.1} giá {fact:price.1}; ship {fact:ship_fee}, giao {fact:ship_time} bạn nhé.',
      p,
      'en',
    );
    expect(out.text).toBe(
      '14-in-1 Foldable Bench A4 giá $398.00; ship 20,000đ, giao 2–4 days bạn nhé.',
    );
    expect(out.missing).toEqual([]);
    expect(out.rendered).toEqual(['14-in-1 Foldable Bench A4', '$398.00', '20,000đ', '2–4 days']);
  });

  it('thời gian một giá trị / khoảng, vi và en; khoảng giá', () => {
    const one = planOf(fact('ship_time', 'ship_time', { type: 'days', min: 3, max: 3 }));
    expect(fill('{fact:ship_time}', one).text).toBe('3 ngày');
    expect(fill('{fact:ship_time}', one, 'en').text).toBe('3 days');
    expect(fill('{fact:ship_time}', p).text).toBe('2–4 ngày');
    expect(fill('{fact:price_range.1}', p).text).toBe('150.000đ – 160.000đ');
  });

  it('phí ship 0 → "miễn phí" / "free"; giá 0 không phải phí ship vẫn là số', () => {
    const free = planOf(
      fact('ship_fee', 'ship_fee', { type: 'money', amountMinor: 0, currency: 'VND' }),
      fact('price.1', 'price', { type: 'money', amountMinor: 0, currency: 'VND' }),
    );
    expect(fill('Ship {fact:ship_fee}', free).text).toBe('Ship miễn phí');
    expect(fill('Ship {fact:ship_fee}', free, 'en').text).toBe('Ship free');
    expect(fill('{fact:price.1}', free).text).toBe('0đ');
  });

  it('tồn kho: còn/hết/số lượng/sắp hết', () => {
    const stock = (value: FactValue) => planOf(fact('stock.1', 'stock', value));
    const cases: Array<[FactValue, string, string]> = [
      [{ type: 'stock', display: 'in' }, 'Còn hàng', 'In stock'],
      [{ type: 'stock', display: 'out' }, 'Hết hàng', 'Out of stock'],
      [{ type: 'stock', display: 'count', n: 25 }, 'Còn 25 sản phẩm', '25 in stock'],
      [{ type: 'stock', display: 'low' }, 'Sắp hết hàng', 'Almost sold out'],
    ];
    for (const [value, vi, en] of cases) {
      expect(fill('{fact:stock.1}', stock(value)).text).toBe(vi);
      expect(fill('{fact:stock.1}', stock(value), 'en').text).toBe(en);
    }
  });

  it('COD, đổi trả, bảo hành, thanh toán — câu trọn nghĩa có/không do code viết', () => {
    const policy = planOf(
      fact('cod', 'cod', { type: 'bool', value: true }),
      fact('returns', 'returns', { type: 'days_count', n: 7 }),
      fact('warranty', 'warranty', { type: 'months_count', n: 12 }),
      fact('payment', 'payment', {
        type: 'methods',
        methods: ['bank_transfer', 'cod', 'zalo_pay'],
      }),
    );
    expect(fill('Shop {fact:cod}, {fact:returns}, {fact:warranty}.', policy).text).toBe(
      'Shop có hỗ trợ thanh toán khi nhận hàng (COD), đổi trả trong 7 ngày, bảo hành 12 tháng.',
    );
    expect(fill('We {fact:cod}; {fact:returns}; {fact:warranty}.', policy, 'en').text).toBe(
      'We support cash on delivery (COD); returns accepted within 7 days; 12-month warranty.',
    );
    expect(fill('{fact:payment}', policy).text).toBe(
      'Chuyển khoản, thanh toán khi nhận hàng (COD), zalo_pay',
    );
    expect(fill('{fact:payment}', policy, 'en').text).toBe(
      'Bank transfer, cash on delivery (COD), zalo_pay',
    );
    const negative = planOf(
      fact('cod', 'cod', { type: 'bool', value: false }),
      fact('returns', 'returns', { type: 'none' }),
      fact('warranty', 'warranty', { type: 'none' }),
    );
    expect(fill('{fact:cod}; {fact:returns}; {fact:warranty}', negative).text).toBe(
      'Chưa hỗ trợ thanh toán khi nhận hàng (COD); không áp dụng đổi trả; không bảo hành',
    );
    expect(fill('{fact:cod}; {fact:returns}; {fact:warranty}', negative, 'en').text).toBe(
      'Does not support cash on delivery (COD); returns are not accepted; no warranty',
    );
  });

  it('số khách nêu và nhãn biến thể đi qua chỗ giữ chỗ', () => {
    expect(fill('Với {fact:customer_measure.1} thì mình tư vấn size M nhé', p).text).toBe(
      'Với 1m58 thì mình tư vấn size M nhé',
    );
  });

  it('mã thiếu/không xác định → ghi vào missing, giữ nguyên chỗ giữ chỗ (nơi gọi phải từ chối)', () => {
    const withUnknown: FactPlan = {
      ...p,
      facts: [...p.facts, { id: 'cod', kind: 'cod', status: 'unknown' }],
    };
    const out = fill('{fact:cod} và {fact:nope}', withUnknown);
    expect(out.missing).toEqual(['cod', 'nope']);
  });

  it('claims và nguồn do CODE sinh từ chỗ giữ chỗ: câu có sự kiện = fact kèm source_ids; câu không có = greeting', () => {
    const out = fill(
      'Chào bạn! {fact:product_name.1} giá {fact:price.1}. Ship {fact:ship_fee} nhé.',
      p,
    );
    expect(out.claims).toEqual([
      { text: 'Chào bạn!', source_ids: [], kind: 'greeting' },
      { text: '14-in-1 Foldable Bench A4 giá $398,00.', source_ids: ['p1'], kind: 'fact' },
      { text: 'Ship 20.000đ nhé.', source_ids: ['kb:ship'], kind: 'fact' },
    ]);
    expect(out.sourceIds).toEqual(['p1', 'kb:ship']);
  });

  it('nguồn "customer" (số khách tự nêu) không phải nguồn kiến thức → không vào sourceIds', () => {
    const out = fill('Với {fact:customer_measure.1} nhé', p);
    expect(out.sourceIds).toEqual([]);
    expect(out.claims[0]).toMatchObject({ kind: 'greeting' });
  });

  it('câu hỏi lại khách không có chỗ giữ chỗ → question_back', () => {
    const out = fill('Bạn ở tỉnh nào ạ?', p);
    expect(out.claims).toEqual([
      { text: 'Bạn ở tỉnh nào ạ?', source_ids: [], kind: 'question_back' },
    ]);
  });
});

describe('fillSlots — điều kiện/phạm vi luôn được ghép vào câu (không khẳng định rộng hơn chính sách)', () => {
  const p = planOf(
    fact('returns', 'returns', {
      type: 'days_count',
      n: 7,
      conditions: ['còn tem mác', 'chưa giặt'],
    }),
    fact('warranty', 'warranty', { type: 'months_count', n: 3, scope: 'đường may' }),
  );
  it('tiếng Việt', () => {
    expect(fill('{fact:returns}; {fact:warranty}.', p).text).toBe(
      'Đổi trả trong 7 ngày (điều kiện: còn tem mác; chưa giặt); bảo hành đường may 3 tháng.',
    );
  });
  it('tiếng Anh', () => {
    expect(fill('{fact:returns}; {fact:warranty}.', p, 'en').text).toBe(
      'Returns accepted within 7 days (conditions: còn tem mác; chưa giặt); 3-month warranty (đường may).',
    );
  });
});

describe('fillSlots — gộp từ "còn" lặp do lời dẫn + cụm điền', () => {
  const p = planOf(fact('stock.1', 'stock', { type: 'stock', display: 'count', n: 5 }));
  it('"hiện còn {fact}" → "hiện còn 5 sản phẩm" (không "còn còn")', () => {
    expect(fill('Áo hiện còn {fact:stock.1} bạn nhé.', p).text).toBe(
      'Áo hiện còn 5 sản phẩm bạn nhé.',
    );
    expect(fill('Áo hiện {fact:stock.1}.', p).text).toBe('Áo hiện còn 5 sản phẩm.');
  });
});

describe('fillSlots — viết hoa chữ đầu khi giá trị mở đầu câu mới', () => {
  const p = planOf(
    fact('price.1', 'price', { type: 'money', amountMinor: 43999, currency: 'USD' }),
    fact('ship_destination', 'ship_destination', {
      type: 'destination',
      ok: true,
      place: 'US',
      shipsTo: ['US'],
    }),
  );
  it('sau dấu chấm → "We ship to…"; giữa câu giữ nguyên chữ thường', () => {
    expect(fill('Price {fact:price.1}. {fact:ship_destination}.', p, 'en').text).toBe(
      'Price $439.99. We ship to the United States.',
    );
    expect(fill('Good news: {fact:ship_destination}.', p, 'en').text).toBe(
      'Good news: we ship to the United States.',
    );
    expect(fill('Giá {fact:price.1}! {fact:ship_destination}', p, 'vi').text).toBe(
      'Giá $439,99! Shop có giao tới Mỹ.',
    );
  });
});

describe('fillSlots — câu sự kiện nối sau "là/is/are" thì bỏ cụm dẫn (mẫu vi-35)', () => {
  const p = planOf(
    fact('ship_destination', 'ship_destination', {
      type: 'destination',
      ok: true,
      place: 'VN',
      shipsTo: ['VN'],
      nationwide: true,
    }),
    fact('ship_fee', 'ship_fee', { type: 'fee_mode', mode: 'free' }),
    fact('refund_to', 'refund_to', { type: 'refund_to', to: 'original_payment' }),
  );
  it('"Phí ship toàn quốc là {fact:ship_destination}." → "Shop giao toàn quốc."', () => {
    expect(fill('Phí ship toàn quốc là {fact:ship_destination}.', p, 'vi').text).toBe(
      'Shop giao toàn quốc.',
    );
    expect(fill('The destination is {fact:ship_destination}.', p, 'en').text).toBe(
      'We ship nationwide.',
    );
    expect(fill('Hoàn tiền là {fact:refund_to}.', p, 'vi').text).toBe(
      'Hoàn tiền về phương thức thanh toán ban đầu.',
    );
  });
  it('chỉ cắt trong CÂU chứa nó; câu trước giữ nguyên; giá trị dạng cụm danh từ (ship_fee) không bị cắt', () => {
    expect(fill('Cảm ơn bạn. Khu vực giao là {fact:ship_destination}.', p, 'vi').text).toBe(
      'Cảm ơn bạn. Shop giao toàn quốc.',
    );
    expect(fill('Phí ship là {fact:ship_fee}.', p, 'vi').text).toBe('Phí ship là miễn phí.');
  });
  it('không có "là/is/are" ngay trước chỗ giữ chỗ thì giữ nguyên lời dẫn', () => {
    expect(fill('Về khu vực giao: {fact:ship_destination}.', p, 'vi').text).toBe(
      'Về khu vực giao: shop giao toàn quốc.',
    );
  });
});

describe('fillSlots — đầu câu trả lời và dấu kết câu của câu sự kiện hoàn chỉnh (en-10)', () => {
  const p = planOf(
    fact('refund_to', 'refund_to', { type: 'refund_to', to: 'original_payment' }),
    fact('price.1', 'price', { type: 'money', amountMinor: 43999, currency: 'USD' }),
  );
  it('chỗ giữ chỗ ở offset 0 → viết hoa; thiếu dấu kết câu → thêm dấu chấm', () => {
    expect(fill('{fact:refund_to}', p, 'en').text).toBe(
      'Refunds go back to the original payment method.',
    );
    expect(fill('{fact:refund_to}', p, 'vi').text).toBe(
      'Hoàn tiền về phương thức thanh toán ban đầu.',
    );
  });
  it('đã có dấu kết câu thì không thêm; giá trị không phải câu hoàn chỉnh thì không thêm', () => {
    expect(fill('{fact:refund_to}!', p, 'en').text).toBe(
      'Refunds go back to the original payment method!',
    );
    expect(fill('Price {fact:price.1}', p, 'en').text).toBe('Price $439.99');
  });
});
