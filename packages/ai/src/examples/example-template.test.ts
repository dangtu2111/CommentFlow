import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildExampleTemplate,
  EXAMPLE_REJECT,
  type ExampleVariant,
  fillExampleTemplate,
  sanitizeExampleText,
} from './example-template';

const V1: ExampleVariant = { id: 'v-1', priceVnd: 150000, stock: 7 };
const V2: ExampleVariant = { id: 'v-2', priceVnd: 220000, stock: 0 };

describe('FR-132 buildExampleTemplate — che PII và dữ kiện', () => {
  it('giữ nguyên câu không có dữ kiện', () => {
    const r = buildExampleTemplate('Dạ shop cảm ơn bạn nha, bạn cần size nào ạ?', [V1]);
    expect(r).toEqual({
      ok: true,
      template: 'Dạ shop cảm ơn bạn nha, bạn cần size nào ạ?',
      variantIds: [],
    });
  });

  it('che SĐT/email rồi từ chối nếu còn sót liên hệ không che được (tổng đài, link)', () => {
    expect(buildExampleTemplate('Gọi 0912345678 nhé', [V1])).toEqual({
      ok: true,
      template: 'Gọi [sđt] nhé',
      variantIds: [],
    });
    expect(buildExampleTemplate('Gửi a@b.com', [V1])).toEqual({
      ok: true,
      template: 'Gửi [email]',
      variantIds: [],
    });
    expect(buildExampleTemplate('Gọi 1900 1234 nha', [V1])).toEqual({
      ok: false,
      code: EXAMPLE_REJECT.CONTACT,
    });
    expect(buildExampleTemplate('Xem shop.vn/sp1', [V1])).toEqual({
      ok: false,
      code: EXAMPLE_REJECT.CONTACT,
    });
  });

  it('thay giá khớp biến thể bằng {price:id}', () => {
    expect(buildExampleTemplate('Áo này 150k, còn hàng nha', [V1, V2])).toEqual({
      ok: true,
      template: 'Áo này {price:v-1}, còn hàng nha',
      variantIds: ['v-1'],
    });
    expect(buildExampleTemplate('Giá 220.000đ và 150k', [V1, V2])).toEqual({
      ok: true,
      template: 'Giá {price:v-2} và {price:v-1}',
      variantIds: ['v-2', 'v-1'],
    });
  });

  it('từ chối giá không khớp biến thể hoặc khoảng giá', () => {
    expect(buildExampleTemplate('Giá 999k ạ', [V1])).toEqual({
      ok: false,
      code: EXAMPLE_REJECT.MONEY,
    });
    expect(buildExampleTemplate('Giá 100-200k', [V1])).toEqual({
      ok: false,
      code: EXAMPLE_REJECT.MONEY,
    });
    expect(buildExampleTemplate('Giá 150k', [])).toEqual({
      ok: false,
      code: EXAMPLE_REJECT.MONEY,
    });
  });

  it('thay tồn kho khớp biến thể bằng {stock:id}; không khớp thì từ chối', () => {
    expect(buildExampleTemplate('Còn 7 cái nha', [V1, V2])).toEqual({
      ok: true,
      template: 'Còn {stock:v-1} cái nha',
      variantIds: ['v-1'],
    });
    expect(buildExampleTemplate('Only 7 left', [V1])).toMatchObject({
      ok: true,
      template: 'Only {stock:v-1} left',
    });
    expect(buildExampleTemplate('Còn 3 cái', [V1])).toEqual({
      ok: false,
      code: EXAMPLE_REJECT.STOCK,
    });
    expect(
      buildExampleTemplate('Còn 120 cái', [{ id: 'v-9', priceVnd: 1, stock: 120 }]),
    ).toMatchObject({ template: 'Còn {stock:v-9} cái' });
  });

  it('từ chối ngày/phần trăm/số trần (dễ cũ)', () => {
    for (const text of ['Giảm 20% hôm nay', 'Đến ngày 30/11 nhé', 'Mã 12345 nha']) {
      expect(buildExampleTemplate(text, [V1])).toEqual({
        ok: false,
        code: EXAMPLE_REJECT.VOLATILE,
      });
    }
  });

  it('từ chối câu rỗng', () => {
    expect(buildExampleTemplate('   ', [V1])).toEqual({ ok: false, code: EXAMPLE_REJECT.EMPTY });
  });

  it('property: mẫu tạo ra không chứa SĐT/email thô', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^0[35789]\d{8}$/),
        fc.stringMatching(/^[a-z]{3,8}$/),
        (phone, user) => {
          const r = buildExampleTemplate(`Gọi ${phone} hoặc ${user}@mail.com nhé`, []);
          expect(r.ok).toBe(true);
          if (r.ok) {
            expect(r.template).not.toContain(phone);
            expect(r.template).not.toContain('@mail.com');
          }
        },
      ),
    );
  });
});

describe('FR-132 hồi quy từ verifier-security', () => {
  it('số kèm đơn vị tiền không bị coi là tồn kho (còn 1 triệu khi tồn = 1)', () => {
    const v = [{ id: 'v-1', priceVnd: 150000, stock: 1 }];
    for (const text of ['Còn 1 triệu thôi ạ', 'còn 1k', 'còn 1 tr nha']) {
      expect(buildExampleTemplate(text, v)).toEqual({ ok: false, code: EXAMPLE_REJECT.MONEY });
    }
  });

  it('nhận thêm cách nói tồn kho: còn lại có N, chỉ còn N, N available', () => {
    expect(buildExampleTemplate('Chỉ còn 7 cái', [V1])).toMatchObject({
      template: 'Chỉ còn {stock:v-1} cái',
    });
    expect(buildExampleTemplate('Còn lại có 7 cái', [V1])).toMatchObject({
      template: 'Còn lại có {stock:v-1} cái',
    });
    expect(buildExampleTemplate('7 available', [V1])).toMatchObject({
      template: '{stock:v-1} available',
    });
  });

  it('từ chối lách: gạch nối mềm, chữ số Ả Rập-Ấn, từ lóng tiền, placeholder tự gõ', () => {
    expect(sanitizeExampleText('Gọi 0912­345678')).toEqual({ ok: true, text: 'Gọi [sđt]' });
    expect(sanitizeExampleText('Gọi ٠٩١٢٣٤٥٦٧٨')).toEqual({
      ok: false,
      code: EXAMPLE_REJECT.CONTACT,
    });
    expect(buildExampleTemplate('Giá 1 củ nhé', [V1])).toEqual({
      ok: false,
      code: EXAMPLE_REJECT.MONEY,
    });
    expect(buildExampleTemplate('Giá {price:v-1}', [V1])).toEqual({
      ok: false,
      code: EXAMPLE_REJECT.VOLATILE,
    });
  });
});

describe('FR-132 fillExampleTemplate — điền giá/tồn hiện tại', () => {
  it('điền giá hiện tại (đã đổi) theo ngôn ngữ', () => {
    const cur = [{ ...V1, priceVnd: 180000, stock: 4 }];
    expect(fillExampleTemplate('Áo {price:v-1}, còn {stock:v-1} cái', cur, 'vi')).toBe(
      'Áo 180.000đ, còn 4 cái',
    );
    expect(fillExampleTemplate('Price {price:v-1}', cur, 'en')).toBe('Price 180,000 VND');
  });

  it('biến thể không còn hoặc tồn kho null → null', () => {
    expect(fillExampleTemplate('Giá {price:v-x}', [V1], 'vi')).toBeNull();
    expect(fillExampleTemplate('Còn {stock:v-1}', [{ ...V1, stock: null }], 'vi')).toBeNull();
  });

  it('câu không placeholder giữ nguyên', () => {
    expect(fillExampleTemplate('Dạ ạ', [], 'vi')).toBe('Dạ ạ');
  });
});
