import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkGuardMoney, extractClaims } from './guard-money';

const keys = (text: string) => extractClaims(text).map((c) => c.key);
const kinds = (reply: string, sources: string[], knownPricesVnd?: number[]) =>
  checkGuardMoney({ reply, sources, knownPricesVnd }).violations.map((v) => v.kind);

describe('FR-030 số tiền: chuẩn hóa về đồng', () => {
  it.each([
    ['150.000đ', 150000],
    ['150,000 đ', 150000],
    ['150000 VNĐ', 150000],
    ['150.000₫', 150000],
    ['150k', 150000],
    ['150K', 150000],
    ['150 nghìn', 150000],
    ['150 ngàn', 150000],
    ['1tr', 1000000],
    ['1 triệu', 1000000],
    ['1,5 triệu', 1500000],
    ['1.5tr', 1500000],
    ['2tr5', 2500000],
    ['1.500.000', 1500000],
    ['2 tỷ', 2000000000],
    ['99.000 đồng', 99000],
  ])('%s → %d', (text, vnd) => {
    expect(keys(`Giá ${text} nhé`)).toEqual([`vnd:${vnd}`]);
  });

  it('khoảng giá "100-150k" tách thành hai số tiền', () => {
    expect(keys('Tầm 100-150k')).toEqual(['vnd:100000', 'vnd:150000']);
    expect(keys('Tầm 100 – 150 triệu')).toEqual(['vnd:100000000', 'vnd:150000000']);
  });

  it('số không phải tiền không bị coi là tiền', () => {
    expect(extractClaims('Size 38, mua 2 cái, mở cửa 10:30')).toEqual([]);
  });

  it('số nhóm nghìn dưới 1.000 không tính (vd "0,500")', () => {
    expect(keys('Cân nặng 0,500 kg')).toEqual([]);
  });
});

describe('FR-030 đối chiếu số tiền với nguồn', () => {
  it('khớp dù viết khác dạng (150k ↔ 150.000đ)', () => {
    expect(kinds('Giá 150.000đ', ['Áo thun giá 150k'])).toEqual([]);
  });

  it('không có trong nguồn → vi phạm money', () => {
    expect(kinds('Giá 199.000đ', ['Áo thun giá 150k'])).toEqual(['money']);
  });

  it('AI tự tính tổng (2 × 150k = 300k) bị bắt', () => {
    expect(kinds('Mua 2 cái là 300k', ['Áo thun giá 150k'])).toEqual(['money']);
  });

  it('giá đọc từ DB (knownPricesVnd) được chấp nhận', () => {
    expect(kinds('Giá 150.000đ', [], [150000])).toEqual([]);
    expect(kinds('Giá 150.001đ', [], [150000])).toEqual(['money']);
  });

  it('cùng một số lặp lại chỉ báo một lần', () => {
    expect(kinds('199k, tức 199.000đ', ['150k'])).toEqual(['money']);
  });
});

describe('FR-030 phần trăm', () => {
  it('khớp / lệch', () => {
    expect(kinds('Giảm 20%', ['Khuyến mãi giảm 20 %'])).toEqual([]);
    expect(kinds('Giảm 20,5%', ['giảm 20.5 phần trăm'])).toEqual([]);
    expect(kinds('Giảm 30%', ['Khuyến mãi giảm 20%'])).toEqual(['percent']);
  });
});

describe('FR-030 ngày', () => {
  it('ngày/tháng/năm các dạng quy về cùng khóa', () => {
    expect(keys('Hết hạn 15/11/2026')).toEqual(['date:d=15;m=11;y=2026']);
    expect(keys('Hết hạn ngày 15 tháng 11 năm 2026')).toEqual(['date:d=15;m=11;y=2026']);
    expect(keys('Hết hạn 15.11.26')).toEqual(['date:d=15;m=11;y=2026']);
    expect(keys('Hết hạn 2026-11-15')).toEqual(['date:d=15;m=11;y=2026']);
    expect(keys('Hết hạn 15/11')).toEqual(['date:d=15;m=11']);
    expect(keys('Giao ngày 15')).toEqual(['date:d=15']);
    expect(keys('Giảm hết tháng 11')).toEqual(['date:m=11']);
    expect(keys('Ngày 5 tháng 3')).toEqual(['date:d=5;m=3']);
  });

  it('ngày không hợp lệ không được coi là ngày', () => {
    expect(extractClaims('Size 38/39, 32/13, 0/5')).toEqual([]);
    expect(extractClaims('ngày 40')).toEqual([]);
    expect(extractClaims('tháng 13')).toEqual([]);
  });

  it('trường nào câu nói thì nguồn phải có trường đó khớp', () => {
    expect(kinds('Giao ngày 15', ['Khuyến mãi đến 15/11/2026'])).toEqual([]);
    expect(kinds('Hết hạn 15/11', ['Khuyến mãi đến 15/11/2026'])).toEqual([]);
    expect(kinds('Hết hạn 15/11/2026', ['Khuyến mãi đến 15/11/2026'])).toEqual([]);
    expect(kinds('Hết hạn tháng 11', ['đến 15/11/2026'])).toEqual([]);
    expect(kinds('Hết hạn 15/11/2027', ['đến 15/11/2026'])).toEqual(['date']);
    expect(kinds('Hết hạn 16/11', ['đến 15/11/2026'])).toEqual(['date']);
    expect(kinds('Hết hạn 15/12', ['đến 15/11/2026'])).toEqual(['date']);
    expect(kinds('Hết hạn tháng 12', ['đến 15/11/2026'])).toEqual(['date']);
    expect(kinds('Giao ngày 20', ['đến 15/11/2026'])).toEqual(['date']);
  });

  it('nguồn chỉ có tháng không đủ cho câu nói ngày', () => {
    expect(kinds('Giao ngày 15/11', ['khuyến mãi tháng 11'])).toEqual(['date']);
  });

  it('nguồn không có năm: câu có năm vẫn phải khớp năm → lệch', () => {
    expect(kinds('Hết hạn 15/11/2026', ['đến 15/11'])).toEqual(['date']);
  });
});

describe('FR-030 số điện thoại', () => {
  it('các dạng viết quy về cùng số', () => {
    expect(keys('Gọi 0912 345 678')).toEqual(['tel:0912345678']);
    expect(keys('Gọi 0912.345.678')).toEqual(['tel:0912345678']);
    expect(keys('Gọi +84 912-345-678')).toEqual(['tel:0912345678']);
    expect(keys('Gọi 84912345678')).toEqual(['tel:0912345678']);
    expect(keys('Hotline 1900 1234 hoặc 1800.567890')).toEqual(['tel:19001234', 'tel:1800567890']);
  });

  it('khớp nguồn / lệch', () => {
    expect(kinds('Gọi 0912 345 678', ['Hotline: +84912345678'])).toEqual([]);
    expect(kinds('Gọi 0912 345 679', ['Hotline: 0912345678'])).toEqual(['phone']);
  });

  it('số tiền dạng 84.500.000đ hoặc 0,5% không bị nhầm thành SĐT', () => {
    expect(keys('84.500.000đ')).toEqual(['vnd:84500000']);
    expect(keys('giảm 0,5%')).toEqual(['pct:0.5']);
  });

  it('vi phạm không chứa SĐT thô (che PII)', () => {
    const r = checkGuardMoney({ reply: 'Gọi 0912345678', sources: [] });
    expect(JSON.stringify(r)).not.toContain('0912345678');
    expect(r.violations).toEqual([{ kind: 'phone', display: '[sđt]' }]);
  });
});

describe('FR-030 email', () => {
  it('email lạ bị bắt, đã che; email trong nguồn thì qua; không bị tính thêm là link', () => {
    const r = checkGuardMoney({ reply: 'Mail shop@abc.vn nhé', sources: [] });
    expect(r.violations).toEqual([{ kind: 'email', display: '[email]' }]);
    expect(kinds('Mail Shop@abc.vn', ['Liên hệ shop@ABC.vn'])).toEqual([]);
  });
});

describe('FR-030 link', () => {
  it('chuẩn hóa: bỏ http(s), www, dấu câu cuối, / cuối, hoa thường', () => {
    expect(keys('Xem https://www.Shop.vn/ao-thun/.')).toEqual(['url:shop.vn/ao-thun']);
    expect(keys('Xem shop.vn/ao-thun!')).toEqual(['url:shop.vn/ao-thun']);
    expect(keys('Xem www.shop.com.vn')).toEqual(['url:shop.com.vn']);
    expect(keys('Chat m.me/shopabc, nhé')).toEqual(['url:m.me/shopabc']);
  });

  it('khớp / lệch', () => {
    expect(kinds('Xem https://shop.vn/a', ['Link: http://www.shop.vn/a/'])).toEqual([]);
    expect(kinds('Xem https://shop.vn/b', ['Link: https://shop.vn/a'])).toEqual(['link']);
    expect(kinds('Xem https://evil.xyz/a?x=1', ['https://evil.xyz/a'])).toEqual(['link']);
  });

  it('tên miền trong nguồn là link: không lẫn với từ thường', () => {
    expect(extractClaims('Xin chào bạn. Cảm ơn shop.')).toEqual([]);
  });
});

describe('FR-030 tổng hợp', () => {
  it('câu không có số/link → ok', () => {
    const r = checkGuardMoney({
      reply: 'Dạ shop còn hàng ạ, bạn nhắn size giúp shop nhé!',
      sources: [],
    });
    expect(r).toEqual({ ok: true, violations: [], claimsChecked: 0 });
  });

  it('nhiều loại cùng lúc; đếm claimsChecked; không đếm trùng chéo loại', () => {
    const r = checkGuardMoney({
      reply: 'Giá 150k giảm 20% đến 15/11, gọi 0912345678 hoặc xem https://shop.vn/a',
      sources: ['150.000đ, giảm 20%, đến 15/11/2026, hotline 0912 345 678, https://shop.vn/a'],
    });
    expect(r.ok).toBe(true);
    expect(r.claimsChecked).toBe(5);
  });

  it('link chứa số/ngày không sinh thêm vi phạm tiền/ngày', () => {
    expect(
      kinds('Xem https://shop.vn/sp/150000-15-11', ['https://shop.vn/sp/150000-15-11']),
    ).toEqual([]);
  });

  it('nguồn rỗng + reply có số → vi phạm theo thứ tự xuất hiện', () => {
    expect(kinds('Giảm 20% còn 150k', [])).toEqual(['percent', 'money']);
  });
});

describe('FR-030 property-based', () => {
  const money = fc.integer({ min: 1000, max: 999_000_000 });
  const fmts: Array<(n: number) => string> = [
    (n) => `${n.toLocaleString('de-DE')}đ`,
    (n) => `${n} VNĐ`,
    (n) => `${n.toLocaleString('en-US')} đồng`,
    (n) => `${n.toLocaleString('de-DE')} ₫`,
  ];
  const fmt = fc.nat({ max: fmts.length - 1 });

  it('số tiền X không có trong nguồn → luôn vi phạm money; có X (dạng khác) → không vi phạm', () => {
    fc.assert(
      fc.property(money, money, fmt, fmt, (x, y, fa, fb) => {
        fc.pre(x !== y);
        const reply = `Giá là ${fmts[fa]?.(x)} ạ`;
        expect(kinds(reply, [`Bảng giá ${fmts[fb]?.(y)}`])).toEqual(['money']);
        expect(kinds(reply, [`Bảng giá ${fmts[fb]?.(x)}`])).toEqual([]);
        expect(kinds(reply, [], [x])).toEqual([]);
      }),
      { seed: 20261106, numRuns: 300 },
    );
  });

  it('bội số nghìn: viết "Nk" ≡ viết đủ số', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }), (k) => {
        expect(kinds(`${k}k`, [`${(k * 1000).toLocaleString('de-DE')}đ`])).toEqual([]);
      }),
      { seed: 20261106, numRuns: 200 },
    );
  });

  it('văn bản chữ thường không số/link → luôn ok', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zà-ỹ ,!?]{0,80}$/), (s) => {
        expect(checkGuardMoney({ reply: s, sources: [] }).ok).toBe(true);
      }),
      { seed: 20261106, numRuns: 200 },
    );
  });

  it('SĐT di động dạng bất kỳ không có trong nguồn → luôn bị bắt; có trong nguồn (dạng khác) → qua', () => {
    const phone = fc
      .tuple(fc.constantFrom('3', '5', '7', '8', '9'), fc.stringMatching(/^[0-9]{8}$/))
      .map(([h, rest]) => `0${h}${rest}`);
    const sep = fc.constantFrom('', ' ', '.', '-');
    const withSep = (p: string, s: string) =>
      `${p.slice(0, 4)}${s}${p.slice(4, 7)}${s}${p.slice(7)}`;
    const intl = (p: string) => `+84${p.slice(1)}`;
    fc.assert(
      fc.property(phone, phone, sep, (a, b, s) => {
        fc.pre(a !== b);
        expect(kinds(`Gọi ${withSep(a, s)} nha`, [`Số ${b}`])).toEqual(['phone']);
        expect(kinds(`Gọi ${withSep(a, s)} nha`, [`Số ${intl(a)}`])).toEqual([]);
      }),
      { seed: 20261106, numRuns: 300 },
    );
  });

  it('đổi thứ tự nguồn không đổi kết quả', () => {
    fc.assert(
      fc.property(fc.array(money, { minLength: 1, maxLength: 5 }), money, (xs, q) => {
        const srcs = xs.map((x) => `giá ${x.toLocaleString('de-DE')}đ`);
        const a = checkGuardMoney({ reply: `${q}đ`, sources: srcs });
        const b = checkGuardMoney({ reply: `${q}đ`, sources: [...srcs].reverse() });
        expect(a).toEqual(b);
      }),
      { seed: 20261106, numRuns: 100 },
    );
  });
});

describe('FR-030 lỗ hổng verifier-security (Chặn merge)', () => {
  it('số trần ≥3 chữ số không đơn vị bị bắt trừ khi có trong nguồn', () => {
    expect(kinds('Giá 199000 ạ', [])).toEqual(['number']);
    expect(kinds('Áo này 250 ạ', ['còn 250 cái'])).toEqual([]);
    expect(kinds('Áo này 250 ạ', ['giá 250k'])).toEqual(['number']);
    expect(kinds('Size 38, 2 cái', [])).toEqual([]);
  });

  it('đơn vị viết không dấu / biến thể', () => {
    expect(keys('1 trieu')).toEqual(['vnd:1000000']);
    expect(keys('2 tỉ')).toEqual(['vnd:2000000000']);
    expect(keys('3 nghin')).toEqual(['vnd:3000']);
    expect(keys('150000d')).toEqual(['vnd:150000']);
    expect(keys('150.000 dong')).toEqual(['vnd:150000']);
  });

  it('phần lẻ sau đơn vị (có khoảng trắng hoặc bằng chữ)', () => {
    expect(keys('1 triệu 2 ạ')).toEqual(['vnd:1200000']);
    expect(keys('1 triệu rưỡi')).toEqual(['vnd:1500000']);
    expect(keys('2 triệu mốt')).toEqual(['vnd:2100000']);
    expect(keys('2tr 5')).toEqual(['vnd:2500000']);
    expect(kinds('1 triệu 2', ['giá 1 triệu'])).toEqual(['money']);
  });

  it('số đứng ngay sau dấu câu không dính khoảng trắng vẫn được kiểm', () => {
    expect(kinds('Dạ...199k ạ', [])).toEqual(['money']);
    expect(kinds('Dạ,199.000đ', [])).toEqual(['money']);
    expect(kinds('giảm,30%', [])).toEqual(['percent']);
    expect(keys('1.500.000')).toEqual(['vnd:1500000']);
  });

  it('ngày/tháng không nuốt số tiền đi sau', () => {
    expect(keys('Ship trong ngày 30k ạ')).toEqual(['vnd:30000']);
    expect(keys('mỗi tháng 2 triệu')).toEqual(['vnd:2000000']);
    expect(kinds('Ship trong ngày 30k', ['đến 30/11'])).toEqual(['money']);
  });

  it('link: display không chứa SĐT thô và bỏ query', () => {
    const r = checkGuardMoney({ reply: 'Chat https://zalo.me/0912345678?x=1', sources: [] });
    expect(JSON.stringify(r)).not.toMatch(/\d{8}/);
    expect(r.violations).toEqual([{ kind: 'link', display: 'zalo.me/[sđt]' }]);
  });

  it('SĐT có ngoặc/phân cách 2–3 ký tự', () => {
    expect(keys('(+84) 912 345 678')).toEqual(['tel:0912345678']);
    expect(keys('0912 - 345 - 678')).toEqual(['tel:0912345678']);
  });

  it('tên miền đuôi lạ có đường dẫn; đuôi mở rộng', () => {
    expect(keys('Đặt tại muahang.online/sp1')).toEqual(['url:muahang.online/sp1']);
    expect(keys('Xem sale.top')).toEqual(['url:sale.top']);
    expect(keys('Xem abc.biz')).toEqual(['url:abc.biz']);
  });

  it('ngày dạng - . không năm sau từ chỉ hạn, mùng, yyyy/m/d', () => {
    expect(keys('Khuyến mãi đến 30-11')).toEqual(['date:d=30;m=11']);
    expect(keys('hết 30.11')).toEqual(['date:d=30;m=11']);
    expect(keys('Mùng 5 nhé')).toEqual(['date:d=5']);
    expect(keys('2026/11/15')).toEqual(['date:d=15;m=11;y=2026']);
  });

  it('khoảng phần trăm kiểm cả hai đầu', () => {
    expect(kinds('giảm 15-20%', ['giảm 20%'])).toEqual(['percent']);
    expect(kinds('giảm 15-20%', ['giảm 15% đến 20%'])).toEqual([]);
  });

  it('Unicode: NFD, full-width, ký tự rộng 0', () => {
    expect(keys('1 triệu')).toEqual(['vnd:1000000']);
    expect(keys('１９９ｋ')).toEqual(['vnd:199000']);
    expect(keys('19​9k')).toEqual(['vnd:199000']);
  });

  it('"1.500k" = 1,5 triệu (dấu chấm là phân cách nghìn)', () => {
    expect(keys('1.500k')).toEqual(['vnd:1500000']);
    expect(keys('1,5k')).toEqual(['vnd:1500']);
  });

  it('EMAIL không bậc hai: chuỗi dài không @ chạy nhanh', () => {
    const t0 = Date.now();
    extractClaims('a'.repeat(60000));
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe('hồi quy en-03: cùng một con số khác cách viết dấu phân cách nghìn', () => {
  const check = (reply: string, source: string) => checkGuardMoney({ reply, sources: [source] });

  it('"4,765 available" khớp nguồn "còn 4765" (cùng số, khác dấu phân cách) → không bị coi là bịa số', () => {
    expect(check('The variant is in stock with 4,765 available.', 'Biến thể: còn 4765').ok).toBe(
      true,
    );
    expect(check('còn 4.765 sản phẩm', 'Biến thể: còn 4765').ok).toBe(true);
  });

  it('chiều ngược lại: câu viết "4765", nguồn ghi "4,765" → khớp', () => {
    expect(check('còn 4765 sản phẩm', 'Stock: 4,765 units').ok).toBe(true);
  });

  it('số KHÔNG có trong nguồn vẫn bị chặn dù viết có dấu phân cách', () => {
    const r = check('in stock with 9,999 available', 'còn 4765');
    expect(r.ok).toBe(false);
    expect(r.violations[0]?.kind).toBe('money');
  });

  it('có ĐƠN VỊ tiền thì nghiêm: số tồn kho 4765 KHÔNG hợp thức hóa một mức giá "4.765đ"', () => {
    expect(check('Giá chỉ 4.765đ', 'còn 4765').ok).toBe(false);
    expect(check('Giá chỉ 4765 đồng', 'còn 4765').ok).toBe(false);
  });
});
