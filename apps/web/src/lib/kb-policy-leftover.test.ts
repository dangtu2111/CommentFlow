import { describe, expect, it } from 'vitest';
import { buildPolicyLeftover, MAX_LEFTOVER_SENTENCES } from './kb-policy-leftover';

const item = (content: string, title = 'Chính sách') => ({
  kind: 'other' as const,
  title,
  content,
});

describe('buildPolicyLeftover', () => {
  it('không có văn bản → không có câu nào', () => {
    expect(buildPolicyLeftover([], []).total).toBe(0);
  });

  it('câu nằm trong bằng chứng của một dòng chính sách thì không liệt kê; còn lại xếp theo chủ đề', () => {
    const out = buildPolicyLeftover(
      [
        item(
          'Khách được đổi trả trong 7 ngày kể từ khi nhận hàng. Phí giao hàng nội thành là 20.000đ. Sản phẩm được bảo hành tại cửa hàng. Chúng tôi chấp nhận chuyển khoản ngân hàng. Shop luôn lắng nghe góp ý của khách.',
        ),
      ],
      ['Khách được đổi trả trong 7 ngày kể từ khi nhận hàng.'],
    );
    expect(out.byCard.returns).toHaveLength(0);
    expect(out.byCard.ship.map((s) => s.sentence)).toEqual(['Phí giao hàng nội thành là 20.000đ.']);
    expect(out.byCard.warranty).toHaveLength(1);
    expect(out.byCard.payment).toHaveLength(1);
    expect(out.byCard.other.map((s) => s.sentence)).toEqual([
      'Shop luôn lắng nghe góp ý của khách.',
    ]);
    expect(out.total).toBe(4);
  });

  it('bằng chứng nhiều câu nối nhau vẫn phủ từng câu; so khớp không phân biệt hoa/thường và khoảng trắng', () => {
    const out = buildPolicyLeftover(
      [item('Đổi trả trong 7 ngày.\nCòn nguyên   tem mác.')],
      ['ĐỔI TRẢ TRONG 7 NGÀY. Còn nguyên tem mác.'],
    );
    expect(out.total).toBe(0);
  });

  it('câu trùng giữa các văn bản chỉ liệt kê một lần; bằng chứng null/rỗng bị bỏ qua', () => {
    const out = buildPolicyLeftover(
      [item('Shop mở cửa từ 8 giờ sáng.', 'A'), item('Shop mở cửa từ 8 giờ sáng.', 'B')],
      [null, ''],
    );
    expect(out.total).toBe(1);
    expect(out.byCard.other[0]?.title).toBe('A');
  });

  it('cắt ở trần số câu', () => {
    const many = Array.from(
      { length: MAX_LEFTOVER_SENTENCES + 20 },
      (_, i) => `Câu thông tin số ${i + 1} của cửa hàng.`,
    ).join(' ');
    expect(buildPolicyLeftover([item(many)], []).total).toBe(MAX_LEFTOVER_SENTENCES);
  });
});
