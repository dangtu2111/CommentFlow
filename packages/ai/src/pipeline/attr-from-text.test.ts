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
      size: 'L',
      color: 'trang',
    });
  });
  it('hai màu cùng được nhắc → color null (không đoán); size vẫn nhận', () => {
    expect(inferAttrsFromText('ao thun basic L trang den', shirt, none)).toEqual({
      size: 'L',
      color: null,
    });
  });
  it('sản phẩm không có trục (vay hoa nhi) → không đổi', () => {
    expect(inferAttrsFromText('vay hoa nhi con hg', [{ attrsNorm: {} }], none)).toEqual(none);
    expect(inferAttrsFromText('vay hoa nhi con hg', [], none)).toEqual(none);
  });
  it('giá trị đã có thì giữ nguyên, không ghi đè', () => {
    expect(inferAttrsFromText('ao mau den', shirt, { size: 'Xl', color: null })).toEqual({
      size: 'Xl',
      color: 'den',
    });
  });
  it('size một chữ cái viết thường ("m có ship k") KHÔNG nhận; sau "size" thì nhận', () => {
    expect(inferAttrsFromText('m co ship k', shirt, none).size).toBeNull();
    expect(inferAttrsFromText('lay size m den', shirt, none)).toEqual({
      size: 'm',
      color: 'den',
    });
  });
  it('màu có dấu / tên tiếng Việt chuẩn hóa như attrs_norm (đen khớp black)', () => {
    expect(inferAttrsFromText('áo màu đen', shirt, none).color).toBe('đen');
  });
  it('không khớp giá trị nào của sản phẩm → null', () => {
    expect(inferAttrsFromText('ao mau do size XXL', shirt, none)).toEqual(none);
  });

  describe('màu không dấu cần ngữ cảnh (chặn đồng âm)', () => {
    const name = ['ao thun basic'];
    const colorOf = (text: string) => inferAttrsFromText(text, shirt, none, name).color;
    it('"ship den Ha Noi", "den khi nao co hang" → null', () => {
      expect(colorOf('ao thun basic ship den Ha Noi mat bao lau')).toBeNull();
      expect(colorOf('cho minh hoi den khi nao co hang')).toBeNull();
    });
    it('sau "mau", liền kề size đã nhận, hoặc liền kề tên sản phẩm → nhận', () => {
      expect(colorOf('ao thun basic L trang')).toBe('trang');
      expect(colorOf('ao thun basic mau trang')).toBe('trang');
      expect(colorOf('ao thun basic trang con k')).toBe('trang');
      expect(colorOf('lay trang L')).toBe('trang');
    });
    it('màu có dấu hoặc tên tiếng Anh nhận ở bất kỳ vị trí; "shop co m hang k" → size null', () => {
      expect(colorOf('ship tới Hà Nội, mình lấy màu đen nhé, ship nhanh')).toBe('đen');
      expect(colorOf('co white khong')).toBe('white');
      expect(inferAttrsFromText('shop co m hang k', shirt, none, name).size).toBeNull();
    });
  });

  describe('size đã có từ LLM: định vị trong câu để xét liền kề (viplain-03)', () => {
    const name = ['áo thun basic'];
    const withSize = (text: string) =>
      inferAttrsFromText(text, shirt, { size: 'L', color: null }, name);
    it('"ao thun basic L trang con ko a" + size L từ LLM → color trang', () => {
      expect(withSize('ao thun basic L trang con ko a')).toEqual({ size: 'L', color: 'trang' });
    });
    it('"ao thun basic ship den Ha Noi" + size L giả định → color null (den không liền kề size lẫn tên)', () => {
      expect(withSize('ao thun basic ship den Ha Noi').color).toBeNull();
    });
    it('size LLM không thấy trong câu → không có điểm neo, màu không dấu ngoài ngữ cảnh vẫn null', () => {
      expect(withSize('cho hoi den khi nao co hang').color).toBeNull();
    });
  });
});
