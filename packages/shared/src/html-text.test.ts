import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from './html-text';

describe('htmlToPlainText', () => {
  it('đoạn văn, xuống dòng và danh sách thành dòng văn bản', () => {
    const html =
      '<h2>Đổi trả</h2><p>Trong 7 ngày.<br>Giữ nguyên tem.</p><ul><li>Còn hóa đơn</li><li>Chưa giặt</li></ul>';
    expect(htmlToPlainText(html)).toBe(
      'Đổi trả\nTrong 7 ngày.\nGiữ nguyên tem.\n- Còn hóa đơn\n- Chưa giặt',
    );
  });

  it('bỏ hoàn toàn script/style và mọi thẻ khác; không để lọt mã chạy', () => {
    const html =
      '<style>p{color:red}</style><script>alert(1)</script><p onclick="x()">An toàn <b>nhé</b></p>';
    const text = htmlToPlainText(html);
    expect(text).toBe('An toàn nhé');
    expect(text).not.toMatch(/alert|color|onclick|<|>/);
  });

  it('giải mã thực thể thông dụng (cả dạng số), không giải mã hai lần', () => {
    expect(
      htmlToPlainText('Tom &amp; Jerry &lt;3 &quot;ok&quot; &#39;x&#39; a&nbsp;b &#8211; &#x2014;'),
    ).toBe('Tom & Jerry <3 "ok" \'x\' a b – —');
    expect(htmlToPlainText('&amp;lt;')).toBe('&lt;');
  });

  it('gộp khoảng trắng và dòng trống thừa; cắt hai đầu', () => {
    expect(htmlToPlainText('  <p>a   b</p>\n\n\n<p></p><p>c</p>  ')).toBe('a b\nc');
  });

  it('chuỗi rỗng hoặc chỉ có thẻ → rỗng', () => {
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText('<p> </p><br/>')).toBe('');
  });

  it('cắt tối đa số ký tự yêu cầu (mặc định 8000)', () => {
    expect(htmlToPlainText('x'.repeat(9000))).toHaveLength(8000);
    expect(htmlToPlainText('x'.repeat(50), 10)).toHaveLength(10);
  });

  it('thực thể số ngoài phạm vi Unicode hợp lệ → bỏ qua, không ném lỗi', () => {
    expect(htmlToPlainText('a&#99999999999;b')).toBe('ab');
  });
});
