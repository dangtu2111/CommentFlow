import { describe, expect, it } from 'vitest';
import { isAppError } from './errors';
import {
  buildContextHeader,
  CHUNK_MAX_CHARS,
  type ChunkDocument,
  chunkDocument,
  chunkText,
  EXPIRY_WARNING_DAYS,
  FAQ_CHUNK_MAX_CHARS,
  HEADER_MAX_CHARS,
  indexText,
  isChunkValidAt,
  isExpiringSoon,
  parseValidity,
} from './kb-chunking';

const NOW = new Date('2026-11-06T00:00:00.000Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const open = { validFrom: null, validUntil: null };

describe('FR-130 context_header', () => {
  it('nối nguồn › mục › tên sản phẩm bằng " › "', () => {
    expect(buildContextHeader(['Chính sách', 'Đổi trả', 'Áo thun'])).toBe(
      'Chính sách › Đổi trả › Áo thun',
    );
  });

  it('bỏ phần rỗng/null/chỉ khoảng trắng; không còn gì → null', () => {
    expect(buildContextHeader(['FAQ', null, '  ', undefined, ' Ship '])).toBe('FAQ › Ship');
    expect(buildContextHeader([null, '', '   '])).toBeNull();
    expect(buildContextHeader([])).toBeNull();
  });

  it('gộp khoảng trắng và cắt đúng trần độ dài', () => {
    const header = buildContextHeader(['a  b\n c', 'x'.repeat(HEADER_MAX_CHARS * 2)]);
    expect(header?.startsWith('a b c › xxx')).toBe(true);
    expect(header?.length).toBe(HEADER_MAX_CHARS);
  });

  it('indexText = header + xuống dòng + content; không header → chỉ content', () => {
    expect(indexText({ contextHeader: 'FAQ › Ship', content: 'Miễn phí' })).toBe(
      'FAQ › Ship\nMiễn phí',
    );
    expect(indexText({ contextHeader: null, content: 'Miễn phí' })).toBe('Miễn phí');
  });
});

describe('FR-055 chunkText', () => {
  it('rỗng hoặc toàn khoảng trắng → không đoạn', () => {
    expect(chunkText('', 100)).toEqual([]);
    expect(chunkText(' \n\n \r\n ', 100)).toEqual([]);
  });

  it('văn bản ngắn giữ nguyên một đoạn (chuẩn hóa xuống dòng)', () => {
    expect(chunkText('  Xin chào\r\nbạn  ', 100)).toEqual(['Xin chào\nbạn']);
  });

  it('gộp các đoạn văn nhỏ đến sát trần, tách khi vượt trần', () => {
    const text = ['aaaa', 'bbbb', 'cccc'].join('\n\n');
    expect(chunkText(text, 10)).toEqual(['aaaa\n\nbbbb', 'cccc']);
    expect(chunkText(text, 100)).toEqual(['aaaa\n\nbbbb\n\ncccc']);
  });

  it('đúng ngưỡng: đoạn dài bằng trần không bị tách', () => {
    expect(chunkText('x'.repeat(10), 10)).toEqual(['x'.repeat(10)]);
    expect(chunkText('x'.repeat(11), 10)).toEqual(['x'.repeat(10), 'x']);
  });

  it('đoạn văn quá dài được tách theo câu', () => {
    const text = 'Câu một dài. Câu hai dài! Câu ba dài? Câu bốn dài…';
    const chunks = chunkText(text, 28);
    expect(chunks.every((c) => c.length <= 28)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
  });

  it('một câu dài hơn trần bị cắt cứng, không mất ký tự', () => {
    const chunks = chunkText('y'.repeat(25), 10);
    expect(chunks).toEqual(['y'.repeat(10), 'y'.repeat(10), 'y'.repeat(5)]);
  });

  it('không tách giữa cặp thay thế Unicode (emoji)', () => {
    const chunks = chunkText('😀'.repeat(7), 4);
    expect(chunks.join('')).toBe('😀'.repeat(7));
    expect(chunks.every((c) => !/[\uD800-\uDBFF]$/.test(c) && !/^[\uDC00-\uDFFF]/.test(c))).toBe(
      true,
    );
  });
});

describe('FR-055 chunkDocument', () => {
  const base: ChunkDocument = {
    key: 'policy:1',
    kind: 'policy',
    sourceTitle: 'Chính sách',
    section: 'Đổi trả',
    lang: 'vi',
    text: 'Đổi trong 7 ngày.',
  };

  it('gắn chunk_key ổn định, header, ngôn ngữ, hạn hiệu lực', () => {
    const validFrom = day(0);
    const validUntil = day(30);
    expect(chunkDocument({ ...base, productId: 'p1', validFrom, validUntil })).toEqual([
      {
        chunkKey: 'policy:1#0',
        content: 'Đổi trong 7 ngày.',
        contextHeader: 'Chính sách › Đổi trả',
        lang: 'vi',
        productId: 'p1',
        validFrom,
        validUntil,
      },
    ]);
  });

  it('mặc định productId/hạn = null; tên sản phẩm vào header', () => {
    const [draft] = chunkDocument({ ...base, kind: 'product', productName: 'Áo thun' });
    expect(draft).toMatchObject({
      contextHeader: 'Chính sách › Đổi trả › Áo thun',
      productId: null,
      validFrom: null,
      validUntil: null,
    });
  });

  it('thiếu mục → header chỉ có nguồn', () => {
    const [draft] = chunkDocument({ ...base, section: undefined });
    expect(draft?.contextHeader).toBe('Chính sách');
  });

  it('văn bản dài sinh nhiều đoạn, mỗi đoạn ≤ trần, khóa tăng dần', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Mục ${i}: ${'z'.repeat(80)}`).join('\n\n');
    const drafts = chunkDocument({ ...base, text });
    expect(drafts.length).toBeGreaterThan(1);
    expect(drafts.every((d) => d.content.length <= CHUNK_MAX_CHARS)).toBe(true);
    expect(drafts.map((d) => d.chunkKey)).toEqual(drafts.map((_, i) => `policy:1#${i}`));
  });

  it('FAQ dùng trần lớn hơn: Hỏi/Đáp ~1500 ký tự vẫn là MỘT đoạn', () => {
    const text = `Hỏi: ship?\nĐáp: ${'a'.repeat(1500)}`;
    expect(CHUNK_MAX_CHARS).toBeLessThan(1500);
    expect(FAQ_CHUNK_MAX_CHARS).toBeGreaterThan(1500);
    expect(chunkDocument({ ...base, kind: 'faq', text })).toHaveLength(1);
    expect(chunkDocument({ ...base, kind: 'manual', text }).length).toBeGreaterThan(1);
  });

  it('văn bản rỗng → không đoạn', () => {
    expect(chunkDocument({ ...base, text: '  ' })).toEqual([]);
  });

  it('chạy lại cùng đầu vào cho cùng kết quả (xác định)', () => {
    expect(chunkDocument(base)).toEqual(chunkDocument(base));
  });
});

describe('FR-131 hạn hiệu lực', () => {
  it('parseValidity: không hạn → null/null', () => {
    expect(parseValidity(undefined, undefined)).toEqual(open);
  });

  it('parseValidity: nhận Date hoặc chuỗi ISO', () => {
    expect(parseValidity('2026-11-01T00:00:00Z', day(5))).toEqual({
      validFrom: new Date('2026-11-01T00:00:00Z'),
      validUntil: day(5),
    });
  });

  it('parseValidity: until <= from bị từ chối VALIDATION_FAILED (đúng ngưỡng cũng từ chối)', () => {
    for (const until of [day(0), day(-1)]) {
      try {
        parseValidity(day(0), until);
        expect.unreachable();
      } catch (error) {
        expect(isAppError(error) && error.code).toBe('VALIDATION_FAILED');
      }
    }
  });

  it('parseValidity: ngày sai định dạng bị từ chối', () => {
    expect(() => parseValidity('không phải ngày', null)).toThrow();
    expect(() => parseValidity(null, new Date('x'))).toThrow();
  });

  it('isChunkValidAt: from <= now < until (until loại trừ, from bao gồm)', () => {
    expect(isChunkValidAt(open, NOW)).toBe(true);
    expect(isChunkValidAt({ validFrom: NOW, validUntil: null }, NOW)).toBe(true);
    expect(isChunkValidAt({ validFrom: day(1), validUntil: null }, NOW)).toBe(false);
    expect(isChunkValidAt({ validFrom: null, validUntil: day(1) }, NOW)).toBe(true);
    expect(isChunkValidAt({ validFrom: null, validUntil: NOW }, NOW)).toBe(false);
    expect(isChunkValidAt({ validFrom: null, validUntil: day(-1) }, NOW)).toBe(false);
  });

  it('isExpiringSoon: còn hiệu lực và hết hạn trong ≤ 3 ngày', () => {
    const until = (d: Date) => ({ validFrom: null, validUntil: d });
    expect(EXPIRY_WARNING_DAYS).toBe(3);
    expect(isExpiringSoon(open, NOW)).toBe(false);
    expect(isExpiringSoon(until(day(3)), NOW)).toBe(true);
    expect(isExpiringSoon(until(new Date(day(3).getTime() + 1)), NOW)).toBe(false);
    expect(isExpiringSoon(until(day(1)), NOW)).toBe(true);
    expect(isExpiringSoon(until(NOW), NOW)).toBe(false);
    expect(isExpiringSoon(until(day(-2)), NOW)).toBe(false);
  });
});
