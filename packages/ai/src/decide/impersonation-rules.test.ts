import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateImpersonation, MAX_COMMENT_LENGTH } from './impersonation-rules';

const PAGES = ['Hoa Xinh Shop'];
const check = (authorName: string, text: string, pageNames: string[] = PAGES) =>
  evaluateImpersonation({ authorName, text, pageNames });

describe('FR-155 chống mạo danh — tên giống Page + tín hiệu', () => {
  it('tên giống hệt + link → nghi mạo danh, chỉ gợi ý ẩn', () => {
    const r = check('Hoa Xinh Shop', 'Nhận quà tại http://bit.ly/abc nhé');
    expect(r.suspected).toBe(true);
    expect(r.reasons).toEqual(expect.arrayContaining(['name_lookalike', 'link', 'gift']));
    expect(r.suggestHide).toBe(true);
  });

  it.each([
    ['bỏ dấu + khác hoa thường', 'HOA XINH SHOP', 'inbox page phụ của shop nhé'],
    ['thêm hậu tố', 'Hoa Xinh Shop CSKH', 'Gọi 0912 345 678 để nhận ưu đãi'],
    ['thay ký tự giống (0→o, 1→i)', 'H0a X1nh Sh0p', 'Page phụ của shop đây ạ'],
    ['chữ Cyrillic giống Latin', 'Ноа Xinh Shop', 'liên hệ +84912345678'],
    ['zero-width chen giữa', 'Hoa​ Xinh​ Shop', 'bấm www.freegift.xyz'],
    ['sai một chữ', 'Hoa Xinh Shpo', 'nhận quà miễn phí'],
  ])('tên %s + tín hiệu → nghi', (_label, name, text) => {
    expect(check(name, text).suspected).toBe(true);
  });

  it('tên giống nhưng bình luận bình thường → KHÔNG nghi (khách trùng tên)', () => {
    const r = check('Hoa Xinh Shop', 'Áo này còn size M không ạ?');
    expect(r.suspected).toBe(false);
    expect(r.suggestHide).toBe(false);
    expect(r.reasons).toContain('name_lookalike');
  });

  it('tên khác hẳn + link vô hại → KHÔNG nghi', () => {
    expect(check('Nguyễn Văn An', 'xem thử http://shopee.vn/abc giá rẻ hơn nè').suspected).toBe(
      false,
    );
  });

  it('tên Page ngắn (<4 ký tự) chỉ khớp khi giống hệt', () => {
    expect(check('Hoa Mai', 'nhận quà', ['Mai']).suspected).toBe(false);
    expect(check('Mai', 'nhận quà', ['Mai']).suspected).toBe(true);
  });
});

describe('FR-155 tự xưng chủ shop/ngân hàng, đòi chuyển khoản', () => {
  it.each([
    'Mình là chủ shop, bạn chuyển khoản cọc vào STK 1903123456789 nhé',
    'Em là admin page, chuyển tiền vào số tài khoản 0123456789 để giữ hàng',
    'Tôi là nhân viên ngân hàng Vietcombank, bạn thanh toán trước giúp tôi',
    'I am the owner, please bank transfer the deposit',
  ])('tên lạ vẫn nghi: %s', (text) => {
    const r = check('Trần Thị B', text);
    expect(r.suspected).toBe(true);
    expect(r.reasons).toContain('self_claim');
  });

  it('khách gọi "chủ shop ơi" + hỏi chuyển khoản → KHÔNG nghi (không tự xưng)', () => {
    expect(check('Lan', 'Chủ shop ơi cho mình xin STK chuyển khoản với').suspected).toBe(false);
  });

  it('tự xưng chủ shop nhưng không đòi tiền/liên hệ → không nghi', () => {
    expect(check('Lan', 'Mình là chủ shop khác, bên mình cũng bán áo').suspected).toBe(false);
  });
});

describe('FR-155 ngoại lệ & thiên về chặn', () => {
  it('chính Page viết (authorIsPage) → bỏ qua, không nghi', () => {
    const r = evaluateImpersonation({
      authorName: 'Hoa Xinh Shop',
      text: 'chuyển khoản vào 0123456789',
      pageNames: PAGES,
      authorIsPage: true,
    });
    expect(r.suspected).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it.each([
    ['null', null],
    ['thiếu text', { authorName: 'A', pageNames: [] }],
    ['text không phải chuỗi', { authorName: 'A', text: 5, pageNames: [] }],
    [
      'authorIsPage không phải boolean',
      { authorName: 'A', text: 'x', pageNames: [], authorIsPage: 'no' },
    ],
    [
      'bình luận quá dài',
      { authorName: 'A', text: 'a'.repeat(MAX_COMMENT_LENGTH + 1), pageNames: [] },
    ],
    ['tên tác giả quá dài', { authorName: 'a'.repeat(500), text: 'x', pageNames: [] }],
  ])('đầu vào hỏng (%s) → nghi + không đọc được, không ném', (_l, input) => {
    const r = evaluateImpersonation(input);
    expect(r).toMatchObject({ suspected: true, unreadable: true });
  });

  it('text hỏng thì authorIsPage hợp lệ không cứu: vẫn chặn', () => {
    expect(
      evaluateImpersonation({ authorName: 'A', text: 1, pageNames: [], authorIsPage: true })
        .suspected,
    ).toBe(true);
  });

  it('kết quả không có đường ẩn/gửi: chỉ có các khóa đã biết', () => {
    const r = check('Hoa Xinh Shop', 'nhận quà http://x.xyz');
    expect(Object.keys(r).sort()).toEqual(
      ['reasons', 'suggestHide', 'suspected', 'unreadable'].sort(),
    );
  });
});

describe('FR-155 bài học từ kiểm chứng độc lập', () => {
  it.each(['Hoa Xinh Store', 'Hoa Xinh Official', 'Hoa Xinh', 'HOA XINH CSKH'])(
    'đổi/bớt từ chung ("%s") + tín hiệu → vẫn nghi',
    (name) => {
      expect(check(name, 'nhận quà http://a.xyz').suspected).toBe(true);
    },
  );

  it('danh sách tên Page rỗng hoặc toàn ký tự không so được → không đọc được (chặn)', () => {
    expect(check('A', 'x', [])).toMatchObject({ suspected: true, unreadable: true });
    expect(check('A', 'x', ['\u{1F600}'])).toMatchObject({ suspected: true, unreadable: true });
  });

  it('nội dung dùng chữ Cyrillic giống Latin vẫn bị bắt', () => {
    const r = check('Lan', 'Mình là chủ shop, chuyển khоản cọc nhé');
    expect(r.suspected).toBe(true);
    expect(r.reasons).toContain('payment_demand');
  });

  it('chuỗi "a-" lặp tối đa không làm tốn CPU (chống ReDoS)', () => {
    const text = 'a-'.repeat(MAX_COMMENT_LENGTH / 2);
    const started = Date.now();
    evaluateImpersonation({ authorName: 'Lan', text, pageNames: PAGES });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('FR-155 property-based', () => {
  it('không bao giờ ném với đầu vào bất kỳ', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const r = evaluateImpersonation(input);
        expect(typeof r.suspected).toBe('boolean');
      }),
    );
  });

  it('chuỗi bất kỳ: suggestHide ⇒ suspected; reasons không trùng', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.array(fc.string(), { maxLength: 4 }), (a, t, p) => {
        const r = evaluateImpersonation({ authorName: a, text: t, pageNames: p });
        expect(!r.suggestHide || r.suspected).toBe(true);
        expect(new Set(r.reasons).size).toBe(r.reasons.length);
      }),
    );
  });

  it('đơn điệu: chèn thêm chữ trước/sau câu đã nghi không làm hết nghi', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 50 }), fc.string({ maxLength: 50 }), (pre, post) => {
        const base = 'Mình là chủ shop, chuyển khoản vào STK 1903123456789';
        expect(check('Lan', `${pre}\n${base}\n${post}`).suspected).toBe(true);
      }),
    );
  });

  it('thứ tự tên Page không ảnh hưởng', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 20 }), { maxLength: 5 }), (names) => {
        const text = 'nhận quà http://a.xyz';
        const a = evaluateImpersonation({ authorName: 'Hoa Xinh Shop', text, pageNames: names });
        const b = evaluateImpersonation({
          authorName: 'Hoa Xinh Shop',
          text,
          pageNames: [...names].reverse(),
        });
        expect(a).toEqual(b);
      }),
    );
  });

  it('tên tác giả trùng một tên Page + có link ⇒ nghi (tên đủ dài)', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{5,20}$/), (name) => {
        expect(check(name, 'xem http://a.xyz', [name]).suspected).toBe(true);
      }),
    );
  });
});
