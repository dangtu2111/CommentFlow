import { describe, expect, it } from 'vitest';
import { checkConceptSupport } from './guard-support';

const SHIP_ONLY = [
  'Phí ship nội thành 20.000đ, toàn quốc 30.000đ. Giao hàng trong 2–4 ngày làm việc.',
];

describe('GUARD-SEMANTIC-SUPPORT — câu khẳng định khái niệm có/không phải được nguồn NÊU khái niệm đó', () => {
  it.each([
    ['COD có dấu', 'Shop có hỗ trợ ship COD bạn nhé, phí ship 30.000đ.', 'cod'],
    ['COD không dấu', 'shop co ho tro thanh toan khi nhan hang nha', 'cod'],
    ['COD tiếng Anh', 'Yes, we offer cash on delivery.', 'cod'],
    ['trả góp', 'Shop có hỗ trợ trả góp 0% bạn nhé.', 'installment'],
    ['trả góp (Anh)', 'You can pay in installments with Klarna.', 'installment'],
    ['quốc tế', 'Shop có ship quốc tế bạn nhé.', 'international_shipping'],
    ['quốc tế (Anh)', 'Yes, we ship worldwide.', 'international_shipping'],
    ['nước cụ thể', 'We ship to Canada within 7 days.', 'international_shipping'],
    ['hóa đơn', 'Shop có xuất hóa đơn đỏ cho công ty.', 'invoice'],
    ['đổi trả', 'Shop nhận đổi trả trong 30 ngày.', 'return'],
    ['hoàn tiền', 'Shop hoàn tiền 100% nếu hàng lỗi.', 'refund'],
    ['bảo hành', 'Sản phẩm được bảo hành 12 tháng.', 'warranty'],
  ])('%s — nguồn chỉ có phí ship → vi phạm "%s"', (_name, reply, concept) => {
    const r = checkConceptSupport({ reply, sources: SHIP_ONLY });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.concept)).toContain(concept);
  });

  it('nguồn CÓ nêu khái niệm → hợp lệ', () => {
    expect(
      checkConceptSupport({
        reply: 'Shop hỗ trợ COD bạn nhé.',
        sources: ['Thanh toán: COD (thanh toán khi nhận hàng) toàn quốc.'],
      }).ok,
    ).toBe(true);
    expect(
      checkConceptSupport({
        reply: 'We ship to Canada.',
        sources: ['We ship to the US and Canada from our warehouse.'],
      }).ok,
    ).toBe(true);
    expect(
      checkConceptSupport({
        reply: 'We ship to Canada.',
        sources: ['We ship worldwide.'],
      }).ok,
    ).toBe(true);
  });

  it('nước KHÁC với nước nguồn nêu → vi phạm (nguồn nói Canada, câu nói Hawaii)', () => {
    const r = checkConceptSupport({
      reply: 'Yes we ship to Hawaii.',
      sources: ['We ship to the US and Canada.'],
    });
    expect(r.ok).toBe(false);
  });

  it('câu nói "chưa có thông tin" về khái niệm (chuyển hướng) KHÔNG bị coi là khẳng định', () => {
    for (const reply of [
      'Bạn ơi, shop chưa có thông tin về hình thức thanh toán COD. Bạn ib shop nhé.',
      'The available product information does not specify a warranty for this product.',
      "Sorry, I don't have information about installments. Please contact the shop.",
      'Bạn ơi, về hình thức ship COD, bạn ib shop để được hỗ trợ nhé.',
    ]) {
      expect(checkConceptSupport({ reply, sources: SHIP_ONLY }).ok).toBe(true);
    }
  });

  it('câu hỏi lại khách ("bạn muốn thanh toán COD không?") không bị coi là khẳng định', () => {
    expect(
      checkConceptSupport({
        reply: 'Bạn muốn thanh toán COD hay chuyển khoản?',
        sources: SHIP_ONLY,
      }).ok,
    ).toBe(true);
  });

  it('không nhắc khái niệm nào → hợp lệ; không có nguồn dùng + có khẳng định → vi phạm', () => {
    expect(checkConceptSupport({ reply: 'Phí ship 30.000đ bạn nhé.', sources: SHIP_ONLY }).ok).toBe(
      true,
    );
    expect(checkConceptSupport({ reply: 'Shop có COD nhé.', sources: [] }).ok).toBe(false);
  });

  it('hợp nhất nhiều nguồn: khái niệm có ở BẤT KỲ nguồn đã dùng là đủ', () => {
    expect(
      checkConceptSupport({
        reply: 'Shop có COD và đổi trả 7 ngày.',
        sources: ['Đổi trả trong 7 ngày.', 'Hỗ trợ COD toàn quốc.'],
      }).ok,
    ).toBe(true);
  });

  it('mỗi khái niệm vi phạm chỉ báo một lần, không lộ nội dung câu', () => {
    const r = checkConceptSupport({
      reply: 'Có COD. Thanh toán khi nhận hàng được nhé.',
      sources: SHIP_ONLY,
    });
    expect(r.violations.filter((v) => v.concept === 'cod')).toHaveLength(1);
    expect(JSON.stringify(r)).not.toMatch(/nhé/);
  });

  it('"được hỗ trợ" trong câu khẳng định KHÔNG được coi là câu chuyển hướng (không để lọt bịa COD)', () => {
    const r = checkConceptSupport({
      reply: 'Shop có COD, được hỗ trợ toàn quốc bạn nhé.',
      sources: SHIP_ONLY,
    });
    expect(r.ok).toBe(false);
  });
});
