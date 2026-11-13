import { describe, expect, it } from 'vitest';
import { appendHashtags, insertAtCursor, parseHttpsLink } from './text-insert';

describe('insertAtCursor', () => {
  it('chèn tại con trỏ; con trỏ mới đứng sau phần vừa chèn', () => {
    expect(insertAtCursor('Xin chào cả nhà', 9, 9, '✨ ')).toEqual({
      text: 'Xin chào ✨ cả nhà',
      cursor: 11,
    });
  });

  it('thay phần đang chọn', () => {
    expect(insertAtCursor('Giá hot', 4, 7, 'sale')).toEqual({ text: 'Giá sale', cursor: 8 });
  });

  it('con trỏ ngoài khoảng hoặc đảo chiều → kẹp vào [0, độ dài]', () => {
    expect(insertAtCursor('abc', 99, 99, 'X')).toEqual({ text: 'abcX', cursor: 4 });
    expect(insertAtCursor('abc', -5, -5, 'X')).toEqual({ text: 'Xabc', cursor: 1 });
    expect(insertAtCursor('abc', 3, 1, 'X')).toEqual({ text: 'aX', cursor: 2 });
  });

  it('chèn vào văn bản rỗng; emoji ghép không bị cắt đôi (độ dài tính theo đơn vị UTF-16 như textarea)', () => {
    expect(insertAtCursor('', 0, 0, '👍')).toEqual({ text: '👍', cursor: 2 });
  });
});

describe('appendHashtags', () => {
  it('thêm vào cuối nội dung ở dòng riêng; bỏ thẻ đã có (không phân biệt hoa/thường)', () => {
    expect(appendHashtags('Áo thun mới về #freeship', ['#FreeShip', '#aothun'])).toBe(
      'Áo thun mới về #freeship\n\n#aothun',
    );
  });

  it('nội dung rỗng → chỉ các thẻ; không có thẻ mới → giữ nguyên', () => {
    expect(appendHashtags('', ['#a1', '#b2'])).toBe('#a1 #b2');
    expect(appendHashtags('Nội dung #ootd', ['#ootd'])).toBe('Nội dung #ootd');
  });
});

describe('parseHttpsLink', () => {
  it('chỉ nhận https hợp lệ (chuẩn hóa), từ chối http/javascript/chuỗi lạ/rỗng', () => {
    expect(parseHttpsLink(' https://shop.vn/ao-thun?a=1 ')).toBe('https://shop.vn/ao-thun?a=1');
    for (const bad of [
      'http://shop.vn',
      'javascript:alert(1)',
      'data:text/html,x',
      'shop.vn',
      '',
      '   ',
      'https://',
    ]) {
      expect(parseHttpsLink(bad), bad).toBeNull();
    }
  });
});
