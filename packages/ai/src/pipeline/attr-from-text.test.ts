import { describe, expect, it } from 'vitest';
import { inferAttrsFromText } from './attr-from-text';

const shirt = [
  { attrsNorm: { size: 's', color: 'white' } },
  { attrsNorm: { size: 'l', color: 'white' } },
  { attrsNorm: { size: 'l', color: 'black' } },
  { attrsNorm: { size: 'm', color: 'black' } },
];
const none = { size: null, color: null };

describe('inferAttrsFromText — size/màu khách nêu mà extract bỏ sót (không dấu)', () => {
  it('"ao thun basic L trang con ko a" → size l, color white', () => {
    expect(inferAttrsFromText('ao thun basic L trang con ko a', shirt, none)).toEqual({
      size: 'l',
      color: 'white',
    });
  });
  it('hai màu cùng được nhắc → color null (không đoán); size vẫn nhận', () => {
    expect(inferAttrsFromText('ao thun basic L trang den', shirt, none)).toEqual({
      size: 'l',
      color: null,
    });
  });
  it('sản phẩm không có trục (vay hoa nhi) → không đổi', () => {
    expect(inferAttrsFromText('vay hoa nhi con hg', [{ attrsNorm: {} }], none)).toEqual(none);
    expect(inferAttrsFromText('vay hoa nhi con hg', [], none)).toEqual(none);
  });
  it('giá trị đã có thì giữ nguyên, không ghi đè', () => {
    expect(inferAttrsFromText('ao L den', shirt, { size: 'Xl', color: null })).toEqual({
      size: 'Xl',
      color: 'black',
    });
  });
  it('size một chữ cái viết thường ("m có ship k") KHÔNG nhận; sau "size" thì nhận', () => {
    expect(inferAttrsFromText('m co ship k', shirt, none).size).toBeNull();
    expect(inferAttrsFromText('lay size m den', shirt, none)).toEqual({
      size: 'm',
      color: 'black',
    });
  });
  it('màu có dấu / tên tiếng Việt chuẩn hóa như attrs_norm (đen → black)', () => {
    expect(inferAttrsFromText('áo màu đen', shirt, none).color).toBe('black');
  });
  it('không khớp giá trị nào của sản phẩm → null', () => {
    expect(inferAttrsFromText('ao mau do size XXL', shirt, none)).toEqual(none);
  });
});
