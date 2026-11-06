import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { extractCleanText, normalizeExtractedText } from './extract-text';

const isForbidden = (c: number) =>
  c <= 0x08 ||
  (c >= 0x0b && c <= 0x1f) ||
  c === 0x7f ||
  (c >= 0x200b && c <= 0x200f) ||
  c === 0xfeff;

describe('FR-053 extractCleanText — tách văn bản sạch từ HTML', () => {
  it('lấy tiêu đề và văn bản, bỏ script/style/comment/noscript/svg', () => {
    const html = `<!doctype html><html><head><title> Chính sách đổi trả </title><style>p{color:red}</style>
      <script>var x = "<p>không lấy</p>";</script></head>
      <body><!-- ghi chú ẩn --><h1>Đổi trả</h1><p>Đổi trong <b>7</b> ngày.</p>
      <noscript>bật JS</noscript><svg><title>icon</title><text>logo</text></svg></body></html>`;
    const result = extractCleanText(html);
    expect(result.title).toBe('Chính sách đổi trả');
    expect(result.text).toBe('Đổi trả\nĐổi trong 7 ngày.');
    expect(result.truncated).toBe(false);
  });

  it('bỏ nav/footer/header/aside/form nhưng giữ nội dung chính khi không có main', () => {
    const html = `<body><header>Logo Menu</header><nav><a>Trang chủ</a></nav>
      <div><p>Phí ship 30.000đ toàn quốc.</p></div><aside>Quảng cáo</aside>
      <form><input value="x"><button>Gửi</button></form><footer>© 2026</footer></body>`;
    expect(extractCleanText(html).text).toBe('Phí ship 30.000đ toàn quốc.');
  });

  it('ưu tiên <main>, rồi <article>, nếu đủ dài', () => {
    const body =
      'Nội dung chính sách bảo hành đủ dài để được coi là phần chính của trang web này, hai mươi từ.';
    expect(
      extractCleanText(`<div>Ngoài lề</div><main><p>${body}</p></main><div>Khác</div>`).text,
    ).toBe(body);
    expect(extractCleanText(`<div>Ngoài lề</div><article>${body}</article>`).text).toBe(body);
    // main quá ngắn → dùng cả trang
    expect(extractCleanText('<div>Ngoài lề dài hơn</div><main>Ngắn</main>').text).toBe(
      'Ngoài lề dài hơn\nNgắn',
    );
  });

  it('bỏ phần tử ẩn (chống giấu lệnh cho AI)', () => {
    const html = `<p>Hiện</p><div hidden>giấu 1</div><div style="display: none">giấu 2<div>lồng</div></div>
      <span aria-hidden="true">giấu 3</span><p style="visibility:hidden">giấu 4</p><p>Cuối</p>`;
    expect(extractCleanText(html).text).toBe('Hiện\nCuối');
  });

  it('giữ ngắt dòng theo khối, danh sách, bảng, <br>', () => {
    const html =
      '<ul><li>Một</li><li>Hai</li></ul><p>A<br>B<br/>C</p><table><tr><th>Size</th><td>S</td></tr><tr><td>M</td></tr></table>';
    expect(extractCleanText(html).text).toBe('- Một\n- Hai\nA\nB\nC\n| Size | S\n| M');
  });

  it('giải mã thực thể tên/số/hex; thực thể lạ hoặc sai giữ nguyên', () => {
    const html =
      '<p>Tom &amp; Jerry &lt;3 &quot;ok&quot; &#39;x&#39; &#x1F600; &nbsp;sau &unknown; &#99999999; &#xD800;</p>';
    expect(extractCleanText(html).text).toBe(
      'Tom & Jerry <3 "ok" \'x\' 😀 sau &unknown; &#99999999; &#xD800;',
    );
  });

  it('loại ký tự điều khiển và ký tự vô hình', () => {
    const html = `<p>a​b‮c\u0000d\u0007e﻿f</p>`;
    expect(extractCleanText(html).text).toBe('abcdef');
  });

  it('HTML hỏng: thẻ chưa đóng, "<" lẻ, thuộc tính có ">" trong ngoặc kép, thẻ cụt cuối', () => {
    expect(extractCleanText('<p>1 < 2 và 3 > 2</p>').text).toBe('1 < 2 và 3 > 2');
    expect(extractCleanText('<a title="a>b">liên kết</a>').text).toBe('liên kết');
    expect(extractCleanText("<a title='x>y'>nháy đơn</a>").text).toBe('nháy đơn');
    expect(extractCleanText('<p>trước<div').text).toBe('trước');
    expect(extractCleanText('<p>trước<!-- không đóng').text).toBe('trước');
    expect(extractCleanText('<p>a<?php echo 1 ?>b<!DOCTYPE x>c</p>').text).toBe('abc');
    expect(extractCleanText('<script>không đóng').text).toBe('');
    expect(extractCleanText('<p>a</p><script>x</script').text).toBe('a');
    expect(extractCleanText('<p>a</p><!doctype x').text).toBe('a');
    expect(extractCleanText('<title>không đóng').title).toBe('không đóng');
    expect(extractCleanText('<nav><nav>lồng</nav>vẫn trong nav</nav><p>ngoài</p>').text).toBe(
      'ngoài',
    );
    expect(extractCleanText('<nav>x</div></nav><p>y</p>').text).toBe('y');
    expect(extractCleanText('<textarea>ẩn</textarea><p>hiện</p>').text).toBe('hiện');
    // Thẻ không-void có "/>" vẫn là thẻ mở (HTML5): không được dùng để lọt phần tử ẩn.
    expect(extractCleanText('<nav/><p>ẩn</p></nav><p>hiện</p>').text).toBe('hiện');
    expect(extractCleanText('<div style="display:none"/>LỆNH ẨN</div><p>hiện</p>').text).toBe(
      'hiện',
    );
    expect(extractCleanText('<br/>a<br />b').text).toBe('a\nb');
    // "İ" đổi độ dài khi toLowerCase: không được làm lệch vị trí thẻ
    expect(extractCleanText('İ<div style="display:none">LỆNH ẨN</div><nav>x</nav>ok').text).toBe(
      'İok',
    );
    // ký tự tag Unicode (ASCII smuggling), bộ chọn biến thể, gạch nối mềm bị bỏ
    expect(extractCleanText('a\u{E0041}\u{E0042}b\u{FE0F}c­d').text).toBe('abcd');
  });

  it('không có tiêu đề → undefined; chỉ lấy tiêu đề đầu tiên', () => {
    expect(extractCleanText('<p>x</p>').title).toBeUndefined();
    expect(extractCleanText('<head><title>A</title></head><title>B</title>').title).toBe('A');
  });

  it('cắt theo giới hạn ký tự và báo truncated', () => {
    const result = extractCleanText(`<p>${'abc '.repeat(100)}</p>`, { maxChars: 50 });
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(50);
    expect(extractCleanText('<p>ngắn</p>', { maxChars: 50 }).truncated).toBe(false);
  });

  it('thời gian tuyến tính với đầu vào lớn/xấu', () => {
    const started = Date.now();
    extractCleanText('<a '.repeat(50_000));
    extractCleanText('<div>'.repeat(50_000) + 'x');
    extractCleanText('<nav>'.repeat(50_000) + 'x');
    extractCleanText(`<p ${'a=" '.repeat(20_000)}`);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('property-based: HTML bất kỳ không ném lỗi, kết quả không chứa ký tự điều khiển, không vượt giới hạn', () => {
    fc.assert(
      fc.property(fc.string(), (html) => {
        const { text } = extractCleanText(html, { maxChars: 1000 });
        return text.length <= 1000 && [...text].every((ch) => !isForbidden(ch.codePointAt(0) ?? 0));
      }),
    );
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(
            '<p>',
            '</p>',
            '<b',
            '>',
            '<',
            '&amp;',
            'chữ',
            ' ',
            '\n',
            '<script>',
            '</script>',
            '<!--',
            '-->',
          ),
        ),
        (parts) => {
          return typeof extractCleanText(parts.join('')).text === 'string';
        },
      ),
    );
  });
});

describe('FR-053 normalizeExtractedText', () => {
  it('gộp khoảng trắng, bỏ dòng trống; cắt đầu cuối; mọi kiểu xuống dòng', () => {
    expect(normalizeExtractedText('  a \t b \n\n\n\n c d  \n')).toBe('a b\nc d');
    expect(normalizeExtractedText('x\r\ny\rz w\u0085v')).toBe('x\ny\nz\nw\nv');
  });

  it('property-based: lũy đẳng (f(f(x)) = f(x))', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const once = normalizeExtractedText(text);
        return normalizeExtractedText(once) === once;
      }),
    );
  });
});
