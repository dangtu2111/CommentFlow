import { COMMENT_LABELS, type CommentLabel } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import { type RouteExtract, routeQuery } from './route';
import { classifyAsk } from './route-topics';

const PRODUCT = ['p-1'];

/** Fixture: object extract tối thiểu cho định tuyến (không phải dữ liệu khách thật). */
function extract(over: Partial<RouteExtract> & { label?: CommentLabel } = {}): RouteExtract {
  const { label, ...rest } = over;
  return {
    labels: [{ label: label ?? 'price' }],
    size: null,
    color: null,
    asks: [],
    order_intent: null,
    ...rest,
  };
}

describe('FR-136 classifyAsk — chủ đề của một ý hỏi', () => {
  it.each([
    ['giá sao shop', 'price'],
    ['Bao nhiêu vậy ạ', 'price'],
    ['how much is it', 'price'],
    ['còn size M không', 'size'],
    ['kích cỡ nào vừa 55kg', 'size'],
    ['có màu đen không', 'color'],
    ['còn hàng không', 'stock'],
    ['hết hàng chưa', 'stock'],
    ['is it in stock', 'stock'],
    // Model extract hay rút ý hỏi thành cụm danh từ ngắn (đo thật bằng EVAL-RUNNER): phải vẫn ra chủ đề tồn kho.
    ['tồn kho', 'stock'],
    ['số lượng tồn', 'stock'],
    ['inventory', 'stock'],
    ['availability', 'stock'],
  ])('%s → %s', (ask, topic) => {
    expect(classifyAsk(ask)).toBe(topic);
  });

  it.each([
    'ship về Cà Mau bao nhiêu', // "Cà Mau" chứa "mau", "bao nhiêu" chứa giá — ship thắng
    'phí vận chuyển',
    'giao hàng mấy ngày',
    'có đổi trả không',
    'bảo hành bao lâu',
    'giảm giá không shop',
    'thanh toán COD được không',
    'chất liệu gì vậy', // không thuộc 4 chủ đề → ý khác (thiên về both)
    '',
  ])('%j → other', (ask) => {
    expect(classifyAsk(ask)).toBe('other');
  });
});

describe('FR-136 routeQuery — nhánh sql', () => {
  it.each(['price', 'purchase'] as const)(
    'nhãn %s + đã nhận sản phẩm + không ý khác → sql',
    (label) => {
      expect(routeQuery({ extract: extract({ label }), resolvedProductIds: PRODUCT })).toEqual({
        route: 'sql',
        reason: 'sql_product_fact',
      });
    },
  );

  it('hỏi size (nhãn advice) với size đã trích → sql', () => {
    const result = routeQuery({
      extract: extract({ label: 'advice', size: 'M' }),
      resolvedProductIds: PRODUCT,
    });
    expect(result.route).toBe('sql');
  });

  it('hỏi màu đã trích → sql; hỏi còn hàng qua asks → sql', () => {
    expect(
      routeQuery({
        extract: extract({ label: 'other', color: 'đen' }),
        resolvedProductIds: PRODUCT,
      }).route,
    ).toBe('sql');
    expect(
      routeQuery({
        extract: extract({ label: 'other', asks: ['còn hàng không'] }),
        resolvedProductIds: PRODUCT,
      }).route,
    ).toBe('sql');
  });

  it('nhiều ý đều thuộc giá/size/màu/tồn → vẫn sql', () => {
    const result = routeQuery({
      extract: extract({ asks: ['giá sao', 'còn size M không', 'màu đen còn hàng không'] }),
      resolvedProductIds: PRODUCT,
    });
    expect(result.route).toBe('sql');
  });

  it('nhãn phụ (advice) bên cạnh price không chặn sql', () => {
    const result = routeQuery({
      extract: extract({
        labels: [{ label: 'price' }, { label: 'advice' }],
      }),
      resolvedProductIds: PRODUCT,
    });
    expect(result.route).toBe('sql');
  });
});

describe('FR-136 routeQuery — nhánh both', () => {
  it('chưa nhận sản phẩm → both, không bao giờ sql', () => {
    expect(routeQuery({ extract: extract(), resolvedProductIds: [] })).toEqual({
      route: 'both',
      reason: 'both_no_product',
    });
  });

  it('giá + ship → both (ý khác)', () => {
    expect(
      routeQuery({
        extract: extract({ asks: ['giá sao', 'ship về Cà Mau bao nhiêu'] }),
        resolvedProductIds: PRODUCT,
      }),
    ).toEqual({ route: 'both', reason: 'both_extra_intent' });
  });

  it('mua hàng có địa chỉ giao (order_intent.address) → both', () => {
    const result = routeQuery({
      extract: extract({
        label: 'purchase',
        order_intent: { items: ['áo'], phone: null, address: 'Cà Mau' },
      }),
      resolvedProductIds: PRODUCT,
    });
    expect(result.route).toBe('both');
  });

  it('order_intent không có địa chỉ → không tính ý khác', () => {
    const result = routeQuery({
      extract: extract({
        label: 'purchase',
        order_intent: { items: ['áo'], phone: null, address: null },
      }),
      resolvedProductIds: PRODUCT,
    });
    expect(result.route).toBe('sql');
  });

  it('ý lạ không nhận ra → both (thiên về tìm thêm)', () => {
    const result = routeQuery({
      extract: extract({ asks: ['chất liệu gì vậy'] }),
      resolvedProductIds: PRODUCT,
    });
    expect(result.route).toBe('both');
  });
});

describe('FR-136 routeQuery — nhánh hybrid', () => {
  it.each(['advice', 'other'] as const)('nhãn %s không có ý giá/size/màu/tồn → hybrid', (label) => {
    expect(routeQuery({ extract: extract({ label }), resolvedProductIds: PRODUCT })).toEqual({
      route: 'hybrid',
      reason: 'hybrid_other',
    });
  });

  it.each(['complaint', 'spam'] as const)('nhãn %s ở bất kỳ vị trí → hybrid', (bad) => {
    const result = routeQuery({
      extract: extract({
        labels: [{ label: 'price' }, { label: bad }],
        size: 'M',
      }),
      resolvedProductIds: PRODUCT,
    });
    expect(result.route).toBe('hybrid');
  });

  it('không sản phẩm + không ý giá/size → hybrid (không phải both)', () => {
    expect(
      routeQuery({ extract: extract({ label: 'advice' }), resolvedProductIds: [] }).route,
    ).toBe('hybrid');
  });

  it('FIXTURE_EXTRACT_DEFAULT (nhãn other) → hybrid', () => {
    expect(
      routeQuery({ extract: FIXTURE_EXTRACT_DEFAULT, resolvedProductIds: PRODUCT }).route,
    ).toBe('hybrid');
  });
});

// ---- property-based ----

const labelArb = fc.constantFrom(...COMMENT_LABELS);
const askArb = fc.oneof(
  fc.constantFrom(
    'giá sao',
    'còn size M không',
    'màu đen không',
    'còn hàng không',
    'ship về Cà Mau',
    'đổi trả sao',
    'bảo hành',
    'chất liệu gì',
  ),
  fc.string({ maxLength: 20 }),
);
const extractArb = fc.record({
  labels: fc.array(
    fc.record({ label: labelArb, confidence: fc.double({ min: 0, max: 1, noNaN: true }) }),
    {
      minLength: 1,
      maxLength: 4,
    },
  ),
  size: fc.option(fc.constantFrom('M', 'L', 'XL'), { nil: null }),
  color: fc.option(fc.constantFrom('đen', 'trắng'), { nil: null }),
  asks: fc.array(askArb, { maxLength: 4 }),
  order_intent: fc.option(
    fc.record({
      items: fc.constant([] as string[]),
      phone: fc.constant(null),
      address: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
    }),
    { nil: null },
  ),
});
const productsArb = fc.array(fc.uuid(), { maxLength: 3 });

describe('FR-136 routeQuery — property-based', () => {
  it('sql ⇒ có sản phẩm đã nhận; luôn đúng một nhánh; xác định', () => {
    fc.assert(
      fc.property(extractArb, productsArb, (ex, products) => {
        const a = routeQuery({ extract: ex, resolvedProductIds: products });
        const b = routeQuery({ extract: ex, resolvedProductIds: products });
        expect(a).toEqual(b);
        expect(['sql', 'both', 'hybrid']).toContain(a.route);
        if (a.route === 'sql') expect(products.length).toBeGreaterThan(0);
      }),
    );
  });

  it('thêm một ý khác (ship) không bao giờ đổi nhánh thành sql', () => {
    fc.assert(
      fc.property(extractArb, productsArb, (ex, products) => {
        const withShip = routeQuery({
          extract: { ...ex, asks: [...ex.asks, 'phí ship bao nhiêu'] },
          resolvedProductIds: products,
        });
        expect(withShip.route).not.toBe('sql');
      }),
    );
  });

  it('có sản phẩm hay không: hybrid giữ nguyên hybrid; không sản phẩm thì không sql', () => {
    fc.assert(
      fc.property(extractArb, (ex) => {
        const none = routeQuery({ extract: ex, resolvedProductIds: [] });
        const some = routeQuery({ extract: ex, resolvedProductIds: PRODUCT });
        expect(none.route).not.toBe('sql');
        expect(none.route === 'hybrid').toBe(some.route === 'hybrid');
      }),
    );
  });

  it('đổi thứ tự asks và nhãn không đổi nhánh', () => {
    fc.assert(
      fc.property(extractArb, productsArb, (ex, products) => {
        const reversed = {
          ...ex,
          asks: [...ex.asks].reverse(),
          labels: [...ex.labels].reverse(),
        };
        expect(routeQuery({ extract: reversed, resolvedProductIds: products }).route).toBe(
          routeQuery({ extract: ex, resolvedProductIds: products }).route,
        );
      }),
    );
  });
});
