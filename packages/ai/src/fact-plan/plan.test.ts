import { describe, expect, it } from 'vitest';
import { buildFactPlan, scopeMatches } from './plan';
import type { FactPlanInput, PlanProduct, PolicyFacts, ShipRow } from './types';

const tote: PlanProduct = {
  id: 'p-tote',
  name: 'Túi tote canvas',
  currency: 'VND',
  priceMinor: 99000,
  stock: 25,
  variants: [],
};
const shirt: PlanProduct = {
  id: 'p-shirt',
  name: 'Áo thun basic',
  currency: 'VND',
  priceMinor: 150000,
  stock: 12,
  variants: [
    { label: 'size M, đen', attrsNorm: { size: 'm', color: 'den' }, priceMinor: 150000, stock: 5 },
    { label: 'size L, đen', attrsNorm: { size: 'l', color: 'den' }, priceMinor: 160000, stock: 0 },
  ],
};
const bench: PlanProduct = {
  id: 'p-bench',
  name: '14-in-1 Pre-Assembled Foldable Dumbbell Bench, A4 32mm',
  currency: 'USD',
  priceMinor: 39800,
  stock: 3,
  variants: [],
};
const ship = (over: Partial<ShipRow> = {}): ShipRow => ({
  kind: 'nationwide',
  label: 'Toàn quốc',
  feeMinor: 30000,
  currency: 'VND',
  daysMin: 2,
  daysMax: 4,
  sourceId: 'kb:ship',
  ...over,
});
const cityHn = ship({
  kind: 'city',
  label: 'Nội thành Hà Nội',
  city: 'Hà Nội',
  feeMinor: 20000,
  daysMin: 1,
  daysMax: 2,
});
const policy = (over: Partial<PolicyFacts> = {}): PolicyFacts => ({ shipping: [], ...over });
const plan = (over: Partial<FactPlanInput>) =>
  buildFactPlan({
    products: [tote],
    topics: ['price'],
    policy: policy(),
    stock: { disclose: 'status', lowAt: null },
    ...over,
  });
const byId = (p: ReturnType<typeof plan>, id: string) => p.facts.find((f) => f.id === id);

describe('fact plan — sản phẩm', () => {
  it('luôn có tên sản phẩm (đi qua chỗ giữ chỗ vì có thể chứa chữ số) và giá một mức', () => {
    const p = plan({ products: [bench], topics: ['price'] });
    expect(byId(p, 'product_name.1')).toMatchObject({
      status: 'known',
      value: { type: 'text', text: '14-in-1 Pre-Assembled Foldable Dumbbell Bench, A4 32mm' },
      sourceId: 'p-bench',
    });
    expect(byId(p, 'price.1')).toMatchObject({
      status: 'known',
      value: { type: 'money', amountMinor: 39800, currency: 'USD' },
    });
  });

  it('biến thể khác giá, khách chưa chọn → khoảng giá (sự kiện riêng); chọn đúng biến thể → giá + nhãn biến thể', () => {
    const range = plan({ products: [shirt] });
    expect(byId(range, 'price_range.1')).toMatchObject({
      value: { type: 'money_range', minMinor: 150000, maxMinor: 160000, currency: 'VND' },
    });
    expect(byId(range, 'price.1')).toBeUndefined();
    const chosen = plan({ products: [shirt], variantAttrs: { size: 'l' } });
    expect(byId(chosen, 'price.1')).toMatchObject({
      value: { type: 'money', amountMinor: 160000 },
    });
    expect(byId(chosen, 'variant.1')).toMatchObject({
      value: { type: 'text', text: 'size L, đen' },
    });
    const sameAll = plan({
      products: [{ ...shirt, variants: shirt.variants.map((v) => ({ ...v, priceMinor: 150000 })) }],
    });
    expect(byId(sameAll, 'price.1')).toMatchObject({
      value: { type: 'money', amountMinor: 150000 },
    });
  });

  it('thuộc tính khách nêu khớp nhiều biến thể hoặc không khớp → không chọn bừa (khoảng giá)', () => {
    expect(
      byId(plan({ products: [shirt], variantAttrs: { color: 'den' } }), 'price_range.1'),
    ).toBeDefined();
    expect(
      byId(plan({ products: [shirt], variantAttrs: { size: 'xl' } }), 'price_range.1'),
    ).toBeDefined();
  });

  it('không có giá → unknown (không bịa); biến thể không giá → dùng giá sản phẩm nếu có', () => {
    const none = plan({ products: [{ ...tote, priceMinor: null }] });
    expect(byId(none, 'price.1')).toEqual({ id: 'price.1', kind: 'price', status: 'unknown' });
    expect(none.unknownTopics).toEqual(['price']);
    const fallback = plan({
      products: [
        { ...shirt, variants: [{ label: 'x', attrsNorm: {}, priceMinor: null, stock: 1 }] },
      ],
    });
    expect(byId(fallback, 'price.1')).toMatchObject({
      value: { type: 'money', amountMinor: 150000 },
    });
  });

  it('nhiều sản phẩm → hậu tố .1 .2 theo thứ tự', () => {
    const p = plan({ products: [tote, shirt], topics: ['price'] });
    expect(p.facts.map((f) => f.id)).toEqual([
      'product_name.1',
      'price.1',
      'product_name.2',
      'price_range.2',
    ]);
  });

  it('số khách tự nêu chỉ đi qua chỗ giữ chỗ customer_measure', () => {
    const p = plan({ measures: ['1m58', 'size 29'] });
    expect(byId(p, 'customer_measure.1')).toMatchObject({
      value: { type: 'text', text: '1m58' },
      sourceId: 'customer',
    });
    expect(byId(p, 'customer_measure.2')).toBeDefined();
  });
});

describe('fact plan — tồn kho (gộp STOCK-DISCLOSURE-OPTION)', () => {
  const stockOf = (product: PlanProduct, mode: FactPlanInput['stock']) =>
    byId(plan({ products: [product], topics: ['stock'], stock: mode }), 'stock.1');
  it('mặc định chỉ còn/hết; Owner bật nêu số thì nêu số', () => {
    expect(stockOf(tote, { disclose: 'status', lowAt: null })).toMatchObject({
      value: { type: 'stock', display: 'in' },
    });
    expect(stockOf({ ...tote, stock: 0 }, { disclose: 'status', lowAt: null })).toMatchObject({
      value: { display: 'out' },
    });
    expect(stockOf(tote, { disclose: 'count', lowAt: null })).toMatchObject({
      value: { display: 'count', n: 25 },
    });
  });
  it('báo sắp hết khi ≤ N (và còn hàng)', () => {
    expect(stockOf({ ...tote, stock: 4 }, { disclose: 'status', lowAt: 5 })).toMatchObject({
      value: { display: 'low' },
    });
    expect(stockOf({ ...tote, stock: 6 }, { disclose: 'status', lowAt: 5 })).toMatchObject({
      value: { display: 'in' },
    });
    expect(stockOf({ ...tote, stock: 0 }, { disclose: 'status', lowAt: 5 })).toMatchObject({
      value: { display: 'out' },
    });
  });
  it('tồn cũ (FR-151) hoặc không có số → unknown', () => {
    expect(stockOf({ ...tote, stockStale: true }, { disclose: 'status', lowAt: null })).toEqual({
      id: 'stock.1',
      kind: 'stock',
      status: 'unknown',
    });
    expect(stockOf({ ...tote, stock: null }, { disclose: 'count', lowAt: null })?.status).toBe(
      'unknown',
    );
  });
});

describe('fact plan — phí/thời gian ship theo khu vực (không đoán)', () => {
  const rows = policy({ shipping: [cityHn, ship()] });
  const run = (
    location: string | null | undefined,
    policyFacts = rows,
    topics = ['ship_fee', 'ship_time'] as FactPlanInput['topics'],
  ) => plan({ topics, location: location ?? null, policy: policyFacts });

  it('khớp dòng nội thành của đúng thành phố → dùng dòng đó', () => {
    const p = run('Hà Nội');
    expect(byId(p, 'ship_fee')).toMatchObject({
      value: { type: 'money', amountMinor: 20000, currency: 'VND' },
      sourceId: 'kb:ship',
    });
    expect(byId(p, 'ship_time')).toMatchObject({ value: { type: 'days', min: 1, max: 2 } });
    expect(p.clarify).toBeNull();
  });

  it('địa điểm trong VN không khớp dòng khác → "Toàn quốc" (kể cả tên cũ: Hải Dương = Hải Phòng)', () => {
    expect(byId(run('Đà Nẵng'), 'ship_fee')).toMatchObject({ value: { amountMinor: 30000 } });
    expect(byId(run('Hải Dương'), 'ship_fee')).toMatchObject({ value: { amountMinor: 30000 } });
  });

  it('dòng khai tên CŨ vẫn khớp khách nói tên MỚI (Bình Dương ↔ TP HCM)', () => {
    const hcm = ship({ kind: 'city', label: 'Nội thành HCM', city: 'Bình Dương', feeMinor: 15000 });
    expect(byId(run('TP HCM', policy({ shipping: [hcm, ship()] })), 'ship_fee')).toMatchObject({
      value: { amountMinor: 15000 },
    });
  });

  it('dòng "region" khớp theo danh sách tỉnh; ưu tiên nội thành > vùng > toàn quốc', () => {
    const north = ship({
      kind: 'region',
      label: 'Miền Bắc',
      places: ['Hải Phòng', 'Quảng Ninh'],
      feeMinor: 25000,
    });
    const p = run('Quảng Ninh', policy({ shipping: [ship(), north, cityHn] }));
    expect(byId(p, 'ship_fee')).toMatchObject({ value: { amountMinor: 25000 } });
  });

  it('khách KHÔNG nêu địa điểm mà phí khác nhau theo khu vực → clarify hỏi tỉnh/thành (không đoán, không redirect)', () => {
    const p = run(null);
    expect(p.clarify).toEqual({ ask: 'region' });
    expect(p.facts.filter((f) => f.status === 'known' && f.kind === 'ship_fee')).toEqual([]);
  });

  it('khách không nêu địa điểm nhưng chỉ có một dòng (toàn quốc) hoặc mọi dòng giống nhau → trả lời luôn', () => {
    expect(byId(run(null, policy({ shipping: [ship()] })), 'ship_fee')).toMatchObject({
      value: { amountMinor: 30000 },
    });
    const same = policy({
      shipping: [ship(), ship({ kind: 'city', label: 'HN', city: 'Hà Nội' })],
    });
    const p = run('', same);
    expect(byId(p, 'ship_fee')).toMatchObject({ value: { amountMinor: 30000 } });
    expect(p.clarify).toBeNull();
  });

  it('khách nêu nhiều tỉnh khác nhau → hỏi lại tỉnh/thành nhận hàng', () => {
    expect(run('từ Hà Nội ship vào Đà Nẵng').clarify).toEqual({ ask: 'region' });
  });

  it('địa điểm không nhận ra / ngoài VN → unknown (không đoán), kể cả khi có dòng toàn quốc', () => {
    const p = run('Paris');
    expect(byId(p, 'ship_fee')).toEqual({ id: 'ship_fee', kind: 'ship_fee', status: 'unknown' });
    expect(p.unknownTopics).toEqual(['ship_fee', 'ship_time']);
    expect(p.clarify).toBeNull();
  });

  it('VN không khớp dòng nào và KHÔNG có dòng toàn quốc → unknown', () => {
    const p = run('Đà Nẵng', policy({ shipping: [cityHn] }));
    expect(byId(p, 'ship_fee')?.status).toBe('unknown');
  });

  it('mixed-11: khách nói "Hà Nội", shop chỉ khai toàn quốc → phí toàn quốc, KHÔNG tự coi là nội thành', () => {
    const p = run('Hà Nội', policy({ shipping: [ship()] }));
    expect(byId(p, 'ship_fee')).toMatchObject({ value: { amountMinor: 30000 } });
  });

  it('không có chính sách ship nào → unknown', () => {
    expect(run('Hà Nội', policy()).unknownTopics).toEqual(['ship_fee', 'ship_time']);
  });

  it('phí/thời gian thiếu trong dòng → unknown riêng cho phần thiếu', () => {
    const p = run(
      'Hà Nội',
      policy({
        shipping: [
          ship({
            kind: 'city',
            label: 'HN',
            city: 'Hà Nội',
            feeMinor: null,
            daysMin: null,
            daysMax: null,
          }),
        ],
      }),
    );
    expect(p.unknownTopics).toEqual(['ship_fee', 'ship_time']);
  });

  it('dòng không hợp lệ bị bỏ và báo: "nội thành" thiếu thành phố / thành phố không nhận ra / vùng không có tỉnh nào nhận ra', () => {
    const noCity = ship({ kind: 'city', label: 'Nội thành', feeMinor: 10000 });
    const badCity = ship({ kind: 'city', label: 'Nội thành X', city: 'Xyz', feeMinor: 10000 });
    const badRegion = ship({ kind: 'region', label: 'Vùng', places: ['Xyz'], feeMinor: 10000 });
    const p = run('Hà Nội', policy({ shipping: [noCity, badCity, badRegion, ship()] }));
    expect(p.issues).toHaveLength(3);
    expect(p.issues[0]).toMatch(/Nội thành.*thành phố/);
    expect(byId(p, 'ship_fee')).toMatchObject({ value: { amountMinor: 30000 } });
  });
});

describe('fact plan — COD, đổi trả, bảo hành, thanh toán', () => {
  const full = policy({
    shipping: [ship({ cod: true })],
    returns: { days: 7, sourceId: 'kb:ret' },
    warranty: { months: 12, sourceId: 'kb:war' },
    payment: { methods: ['bank_transfer', 'cod'], sourceId: 'kb:pay' },
  });
  const topics: FactPlanInput['topics'] = ['cod', 'returns', 'warranty', 'payment'];

  it('có dữ liệu → known kèm nguồn', () => {
    const p = plan({ topics, policy: full });
    expect(byId(p, 'cod')).toMatchObject({
      value: { type: 'bool', value: true },
      sourceId: 'kb:ship',
    });
    expect(byId(p, 'returns')).toMatchObject({ value: { type: 'days_count', n: 7 } });
    expect(byId(p, 'warranty')).toMatchObject({ value: { type: 'months_count', n: 12 } });
    expect(byId(p, 'payment')).toMatchObject({
      value: { type: 'methods', methods: ['bank_transfer', 'cod'] },
    });
  });

  it('COD chung (không theo dòng) khi dòng không nói riêng; dòng nói riêng ưu tiên', () => {
    const general = policy({ shipping: [ship()], cod: { value: false, sourceId: 'kb:cod' } });
    expect(byId(plan({ topics: ['cod'], policy: general }), 'cod')).toMatchObject({
      value: { value: false },
      sourceId: 'kb:cod',
    });
    const perRow = policy({
      shipping: [cityHn, ship({ cod: false })],
      cod: { value: true, sourceId: 'kb:cod' },
    });
    expect(
      byId(plan({ topics: ['cod'], policy: perRow, location: 'Hà Nội' }), 'cod'),
    ).toMatchObject({ value: { value: true }, sourceId: 'kb:cod' });
    expect(
      byId(plan({ topics: ['cod'], policy: perRow, location: 'Đà Nẵng' }), 'cod'),
    ).toMatchObject({ value: { value: false }, sourceId: 'kb:ship' });
  });

  it('COD khác nhau theo khu vực mà khách chưa nêu → clarify hỏi tỉnh/thành', () => {
    const perRow = policy({
      shipping: [
        ship({ kind: 'city', label: 'HN', city: 'Hà Nội', cod: true }),
        ship({ cod: false }),
      ],
    });
    const p = plan({ topics: ['cod'], policy: perRow });
    expect(p.clarify).toEqual({ ask: 'region' });
  });

  it('chính sách ghi rõ KHÔNG có (đổi trả/bảo hành) → known none; thiếu hẳn → unknown', () => {
    const none = policy({
      returns: { days: null, none: true, sourceId: 'kb:ret' },
      warranty: { months: null, none: true, sourceId: 'kb:war' },
    });
    const p = plan({ topics: ['returns', 'warranty', 'payment', 'cod'], policy: none });
    expect(byId(p, 'returns')).toMatchObject({ value: { type: 'none' } });
    expect(byId(p, 'warranty')).toMatchObject({ value: { type: 'none' } });
    expect(p.unknownTopics).toEqual(['payment', 'cod']);
  });

  it('có bản ghi nhưng thiếu số ngày/tháng → unknown', () => {
    const p = plan({
      topics: ['returns', 'warranty'],
      policy: policy({
        returns: { days: null, sourceId: 'k' },
        warranty: { months: null, sourceId: 'k' },
      }),
    });
    expect(p.unknownTopics).toEqual(['returns', 'warranty']);
  });

  it('COD chung/dòng không biết → unknown', () => {
    expect(
      plan({ topics: ['cod'], policy: policy({ shipping: [ship({ cod: null })] }) }).unknownTopics,
    ).toEqual(['cod']);
  });
});

describe('buildFactPlan — điều kiện/phạm vi đi cùng giá trị chính sách', () => {
  it('conditions/scope được chuyển vào sự kiện', () => {
    const p = buildFactPlan({
      topics: ['returns', 'warranty'],
      products: [],
      policy: {
        shipping: [],
        returns: { days: 7, conditions: ['còn tem mác'], sourceId: 'pf:1' },
        warranty: { months: 3, scope: 'đường may', sourceId: 'pf:2' },
      },
      location: null,
      stock: { disclose: 'status', lowAt: null },
    } as never);
    expect(p.facts.find((f) => f.id === 'returns')).toMatchObject({
      value: { type: 'days_count', n: 7, conditions: ['còn tem mác'] },
    });
    expect(p.facts.find((f) => f.id === 'warranty')).toMatchObject({
      value: { type: 'months_count', n: 3, scope: 'đường may' },
    });
  });
});

describe('fact plan — tồn kho khi sản phẩm có biến thể mà chưa chọn được một biến thể', () => {
  const variantsOf = (stocks: Array<number | null>): PlanProduct => ({
    ...shirt,
    stock: 26,
    variants: stocks.map((stock, i) => ({
      label: `v${i}`,
      attrsNorm: { size: `s${i}` },
      priceMinor: 150000,
      stock,
    })),
  });
  const stockOf = (product: PlanProduct) =>
    byId(
      plan({ products: [product], topics: ['stock'], stock: { disclose: 'count', lowAt: null } }),
      'stock.1',
    );
  it('KHÔNG nêu số lượng (kể cả khi Owner bật nêu số); còn/hết theo các biến thể', () => {
    expect(stockOf(variantsOf([5, 0]))).toMatchObject({ value: { type: 'stock', display: 'in' } });
    expect(stockOf(variantsOf([0, 0]))).toMatchObject({ value: { type: 'stock', display: 'out' } });
    expect(stockOf(variantsOf([null, null]))?.status).toBe('unknown');
    expect(stockOf({ ...variantsOf([5]), stockStale: true })?.status).toBe('unknown');
  });
});

describe('fact plan — sản phẩm chỉ có MỘT biến thể', () => {
  it('khách không nêu size/màu vẫn dùng biến thể duy nhất (tồn kho đúng số của nó)', () => {
    const one: PlanProduct = {
      ...shirt,
      stock: 3,
      variants: [
        { label: 'Xanh, M', attrsNorm: { color: 'blue', size: 'm' }, priceMinor: 320000, stock: 3 },
      ],
    };
    const p = plan({
      products: [one],
      topics: ['stock'],
      stock: { disclose: 'count', lowAt: null },
    });
    expect(byId(p, 'stock.1')).toMatchObject({ value: { type: 'stock', display: 'count', n: 3 } });
  });
});

describe('fact plan — nhắc biến thể chỉ khi khách đã chọn', () => {
  const single: PlanProduct = {
    ...shirt,
    stock: 3,
    variants: [
      {
        label: 'Ships From China Mainland',
        attrsNorm: { ships_from: 'china mainland' },
        priceMinor: 43999,
        stock: 3,
      },
    ],
  };
  it('biến thể duy nhất tự chọn: giá/tồn theo biến thể nhưng KHÔNG có sự kiện variant (không nhắc tên biến thể)', () => {
    const p = plan({
      products: [single],
      topics: ['price', 'stock'],
      stock: { disclose: 'count', lowAt: null },
    });
    expect(p.facts.map((f) => f.id)).toEqual(['product_name.1', 'price.1', 'stock.1']);
  });
  it('khách nêu size/màu khớp biến thể → có sự kiện variant', () => {
    const two: PlanProduct = {
      ...shirt,
      variants: [
        {
          label: 'Size M, Đen',
          attrsNorm: { size: 'm', color: 'black' },
          priceMinor: 150000,
          stock: 5,
        },
        {
          label: 'Size L, Đen',
          attrsNorm: { size: 'l', color: 'black' },
          priceMinor: 150000,
          stock: 2,
        },
      ],
    };
    const p = plan({
      products: [two],
      topics: ['price'],
      variantAttrs: { size: 'm', color: 'black' },
    });
    expect(p.facts.map((f) => f.id)).toContain('variant.1');
  });
});

describe('scopeMatches — khớp phạm vi bảo hành bằng code (không đồng nghĩa, không LLM)', () => {
  it.each([
    ['đường may', 'Đường may bị bung thì có được bảo hành không', true],
    ['đường may', 'duong may bung', true],
    ['thân máy', 'máy bị hỏng nặng quá', false],
    ['thân máy', 'than may hong', true],
    ['Seams', 'the seams came apart', true],
    ['đường may', 'Khóa kéo hỏng có bảo hành không', false],
    ['đường may', 'quần may đo', false],
    ['', 'bất kỳ', false],
  ])('%s | %s → %s', (scope, text, expected) => {
    expect(scopeMatches(scope, text)).toBe(expected);
  });
});

describe('buildFactPlan — cặp phí/thời gian ship và đổi trả định tính', () => {
  it('hỏi phí mà dòng có cả ngày → cấp luôn ship_time cùng nguồn; ngược lại cũng vậy', () => {
    const p = plan({ topics: ['ship_fee'], policy: policy({ shipping: [ship()] }) });
    expect(byId(p, 'ship_fee')).toMatchObject({ status: 'known', sourceId: 'kb:ship' });
    expect(byId(p, 'ship_time')).toMatchObject({ status: 'known', sourceId: 'kb:ship' });
    const q = plan({ topics: ['ship_time'], policy: policy({ shipping: [ship()] }) });
    expect(byId(q, 'ship_fee')).toMatchObject({ status: 'known', sourceId: 'kb:ship' });
  });

  it('dòng thiếu ngày → chỉ ship_fee, không thêm unknown cho ship_time', () => {
    const p = plan({
      topics: ['ship_fee'],
      policy: policy({ shipping: [ship({ daysMin: null, daysMax: null })] }),
    });
    expect(byId(p, 'ship_fee')?.status).toBe('known');
    expect(byId(p, 'ship_time')).toBeUndefined();
    expect(p.unknownTopics).toEqual([]);
  });

  it('dòng thiếu phí → chỉ ship_time', () => {
    const p = plan({
      topics: ['ship_time'],
      policy: policy({ shipping: [ship({ feeMinor: null })] }),
    });
    expect(byId(p, 'ship_time')?.status).toBe('known');
    expect(byId(p, 'ship_fee')).toBeUndefined();
  });

  it('returns không có ngày nhưng có refundTo/eligibility → cấp sự kiện định tính, không unknown', () => {
    const p = plan({
      topics: ['returns'],
      policy: policy({
        returns: {
          days: null,
          refundTo: 'original_payment',
          eligibility: 'varies_by_item',
          sourceId: 'pf:r',
        },
      }),
    });
    expect(p.unknownTopics).toEqual([]);
    expect(byId(p, 'return_eligibility')).toMatchObject({ status: 'known', sourceId: 'pf:r' });
    expect(byId(p, 'refund_to')).toMatchObject({ status: 'known', sourceId: 'pf:r' });
    expect(byId(p, 'return_shipping')).toBeUndefined();
    expect(byId(p, 'returns')).toBeUndefined();
  });

  it('returns không ngày và không trường định tính nào → vẫn unknown', () => {
    const p = plan({
      topics: ['returns'],
      policy: policy({ returns: { days: null, sourceId: 'pf:r' } }),
    });
    expect(p.unknownTopics).toEqual(['returns']);
  });
});
