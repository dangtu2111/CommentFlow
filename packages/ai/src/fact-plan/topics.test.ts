import { describe, expect, it } from 'vitest';
import { factTopicsOf } from './topics';

describe('factTopicsOf — chủ đề sự kiện từ câu khách (quy tắc từ khóa TẠM, sẽ thay bằng mã chủ đề enum của nhóm (6))', () => {
  it.each([
    ['Tote bag giá bao nhiêu, ship Hà Nội mất mấy ngày?', ['price', 'ship_time']],
    ['Shop có ship COD không ạ', ['cod']],
    ['co ship cod k shop', ['cod']],
    ['Phí ship ra Đà Nẵng bao nhiêu?', ['ship_fee']],
    ['Ship bao lâu thì nhận được hàng?', ['ship_time']],
    ['How much is shipping and how long does delivery take?', ['ship_fee', 'ship_time']],
    ['ship về Huế được không', ['ship_fee', 'ship_time']],
    ['Còn hàng không shop?', ['stock']],
    ['Is it in stock?', ['stock']],
    ['Đổi trả trong mấy ngày?', ['returns']],
    ['Do you offer refund?', ['returns']],
    ['Sản phẩm bảo hành bao lâu', ['warranty']],
    ['Shop nhận chuyển khoản hay trả góp?', ['payment']],
    ['Giá bao nhiêu vậy ạ', ['price']],
    ['How much is the dog nail scratch board?', ['price']],
    ['Cho mình hỏi size M', []],
  ])('%s', (text, topics) => {
    expect(factTopicsOf(text)).toEqual(topics);
  });

  it('không nhầm "giao" thành "giá"; từ trong từ khác không tính', () => {
    expect(factTopicsOf('giao hàng nhanh không')).not.toContain('price');
    expect(factTopicsOf('Shop giàu kinh nghiệm quá')).toEqual([]);
  });

  it('nhiều ý một câu giữ thứ tự cố định, không trùng', () => {
    expect(factTopicsOf('Giá bao nhiêu, còn hàng không, bảo hành và đổi trả sao?')).toEqual([
      'price',
      'stock',
      'returns',
      'warranty',
    ]);
  });
});
