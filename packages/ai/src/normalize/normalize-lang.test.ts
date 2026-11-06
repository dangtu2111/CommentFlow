import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type AbbreviationDict,
  createAbbreviationDict,
  type LangDetector,
  normalizeAndDetectLang,
  normalizeText,
} from './normalize-lang';

const dict: AbbreviationDict = createAbbreviationDict({
  ib: 'inbox',
  sz: 'size',
  bn: 'bao nhiêu',
  k: 'không',
  dc: 'được',
});

describe('FR-025 normalizeText — NFC, viết thường, khoảng trắng', () => {
  it('đưa về NFC (chữ tổ hợp → dựng sẵn), viết thường, gộp khoảng trắng', () => {
    const decomposed = 'Cái  ÁO\t Đẹp \n';
    const { text } = normalizeText(decomposed);
    expect(text).toBe('cái áo đẹp');
    expect(text).toBe(text.normalize('NFC'));
  });

  it('không có từ điển → không mở rộng', () => {
    expect(normalizeText('ib sz bn', undefined)).toEqual({
      text: 'ib sz bn',
      abbreviationHits: 0,
    });
  });

  it('property: idempotent, luôn NFC, đã cắt khoảng trắng', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const once = normalizeText(input).text;
        expect(normalizeText(once).text).toBe(once);
        expect(once).toBe(once.normalize('NFC'));
        expect(once).toBe(once.trim());
        expect(once).not.toMatch(/\s{2}/u);
      }),
    );
  });
});

describe('FR-025 normalizeText — mở rộng viết tắt qua từ điển truyền vào', () => {
  it('mở rộng từng từ, bỏ qua dấu câu hai đầu và giữ lại dấu câu', () => {
    const { text, abbreviationHits } = normalizeText('Ib shop, sz M bn?', dict);
    expect(text).toBe('inbox shop, size m bao nhiêu?');
    expect(abbreviationHits).toBe(3);
  });

  it('khóa từ điển được chuẩn hóa NFC/thường; khóa rỗng bị bỏ', () => {
    const d = createAbbreviationDict({ Đc: 'được', '': 'bỏ' });
    expect(normalizeText('đc nha', d).text).toBe('được nha');
    expect(d.lookup('')).toBeUndefined();
  });

  it('FR-025 nhận từ điển không nguyên mẫu (đầu ra của loadAbbreviationEntries ở @flow/db)', () => {
    const entries: Record<string, string> = Object.create(null);
    entries.ib = 'inbox';
    entries.sz = 'size';
    const d = createAbbreviationDict(entries);
    expect(normalizeText('ib sz m', d).text).toBe('inbox size m');
  });

  it('không có từ nào trúng → hits = 0', () => {
    expect(normalizeText('xin chào', dict).abbreviationHits).toBe(0);
  });
});

describe('FR-159 nhận diện chữ viết khác → other (§5 quy tắc 0)', () => {
  it.each([
    ['Hán', '这个多少钱'],
    ['Thái', 'ราคาเท่าไหร่'],
    ['Hangul', '얼마예요'],
    ['Kana', 'いくらですか'],
    ['Cyrillic', 'сколько стоит'],
    ['Latin lẫn chữ Hán', 'giá bao nhiêu 谢谢'],
  ])('%s → other', (_name, text) => {
    expect(normalizeAndDetectLang({ text })).toMatchObject({ lang: 'other', rule: 'script' });
  });

  it('property: có bất kỳ chữ khác Latin nào → other', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom('好', '谢', 'я', 'ก', '한', 'あ', 'ア'),
        fc.string(),
        (a, ch, b) => {
          expect(normalizeAndDetectLang({ text: `${a}${ch}${b}` }).lang).toBe('other');
        },
      ),
    );
  });

  it('detector đầy đủ trả other với độ tin cậy ≥ 0,9 → other; thấp hơn thì không', () => {
    const make = (confidence: number): LangDetector => ({
      detect: (_t, mode) => (mode === 'all' ? { lang: 'other', confidence } : null),
    });
    const text = 'bonjour, quel est le prix';
    expect(normalizeAndDetectLang({ text, detector: make(0.95) })).toMatchObject({
      lang: 'other',
      rule: 'detector-other',
    });
    expect(normalizeAndDetectLang({ text, detector: make(0.5) }).lang).not.toBe('other');
  });

  it('detector đầy đủ trả vi/en thì không ghi đè các quy tắc sau', () => {
    const detector: LangDetector = {
      detect: (_t, mode) => (mode === 'all' ? { lang: 'en', confidence: 0.99 } : null),
    };
    expect(normalizeAndDetectLang({ text: 'áo đẹp quá', detector }).lang).toBe('vi');
  });
});

describe('FR-120 nhận diện vi/en theo docs/09 §5', () => {
  it('quy tắc 1: có dấu tiếng Việt → vi', () => {
    expect(normalizeAndDetectLang({ text: 'áo này còn size M không shop' })).toMatchObject({
      lang: 'vi',
      rule: 'diacritics',
    });
  });

  it('quy tắc 2: trúng từ điển viết tắt → vi, kể cả không dấu', () => {
    expect(normalizeAndDetectLang({ text: 'ib gia sz M nha', dict })).toMatchObject({
      lang: 'vi',
      rule: 'abbreviation',
    });
  });

  it('quy tắc 3: tiếng Anh dài đủ → en; tiếng Việt không dấu dài đủ → vi', () => {
    expect(
      normalizeAndDetectLang({ text: 'How much is this shirt and do you have it in stock' }),
    ).toMatchObject({ lang: 'en', rule: 'detector' });
    expect(
      normalizeAndDetectLang({ text: 'cho minh hoi ao nay con hang khong va gia bao nhieu' }),
    ).toMatchObject({ lang: 'vi', rule: 'detector' });
  });

  it('quy tắc 3: dùng detector truyền vào (chế độ vi-en) khi đủ tin cậy', () => {
    const detector: LangDetector = {
      detect: (_t, mode) => (mode === 'vi-en' ? { lang: 'en', confidence: 0.8 } : null),
    };
    expect(normalizeAndDetectLang({ text: 'zzz qqq www eee rrr', detector })).toMatchObject({
      lang: 'en',
      rule: 'detector',
    });
  });

  it('quy tắc 3: detector kém tin cậy hoặc trả other (chế độ vi-en) bị bỏ qua', () => {
    const other: LangDetector = {
      detect: (_t, mode) => (mode === 'vi-en' ? { lang: 'other', confidence: 0.99 } : null),
    };
    expect(normalizeAndDetectLang({ text: 'zzz qqq www eee rrr', detector: other })).toMatchObject({
      lang: 'vi',
      rule: 'default',
    });
    const weak: LangDetector = {
      detect: (_t, mode) => (mode === 'vi-en' ? { lang: 'en', confidence: 0.3 } : null),
    };
    expect(normalizeAndDetectLang({ text: 'zzz qqq www eee rrr', detector: weak }).rule).toBe(
      'default',
    );
  });

  it('quy tắc 4: câu ≤ 3 từ → ngôn ngữ tin trước → reply_language → vi', () => {
    expect(normalizeAndDetectLang({ text: 'ok', previousLang: 'en' })).toMatchObject({
      lang: 'en',
      rule: 'context',
    });
    expect(normalizeAndDetectLang({ text: 'ok', replyLanguage: 'en' })).toMatchObject({
      lang: 'en',
      rule: 'default',
    });
    expect(normalizeAndDetectLang({ text: '😀' })).toMatchObject({ lang: 'vi', rule: 'default' });
    expect(
      normalizeAndDetectLang({ text: 'hi', previousLang: 'vi', replyLanguage: 'en' }).lang,
    ).toBe('vi');
  });

  it('quy tắc 4: câu dài nhưng không có bằng chứng → ngôn ngữ trước', () => {
    expect(
      normalizeAndDetectLang({ text: 'qwe rty uio pas dfg hjk', previousLang: 'en' }),
    ).toMatchObject({ lang: 'en', rule: 'context' });
  });

  it('quy tắc 5: câu trộn → ngôn ngữ chiếm đa số từ; hòa → vi', () => {
    expect(normalizeAndDetectLang({ text: 'how much is this ao gia ban' })).toMatchObject({
      lang: 'en',
      rule: 'mixed-majority',
    });
    expect(normalizeAndDetectLang({ text: 'how much gia bao' })).toMatchObject({
      lang: 'vi',
      rule: 'mixed-majority',
    });
  });

  it('kết quả trả kèm văn bản đã chuẩn hóa (sau mở rộng viết tắt)', () => {
    const r = normalizeAndDetectLang({ text: 'IB  giá BN', dict });
    expect(r.normalized).toBe('inbox giá bao nhiêu');
    expect(r.abbreviationHits).toBe(2);
  });
});

describe('FR-120 property: không ném lỗi, lang luôn hợp lệ', () => {
  it('mọi chuỗi → lang ∈ {vi, en, other}', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const r = normalizeAndDetectLang({ text, dict });
        expect(['vi', 'en', 'other']).toContain(r.lang);
        expect(r.normalized).toBe(r.normalized.normalize('NFC'));
      }),
    );
  });

  it('chữ Latin không dấu, không từ điển → không bao giờ other', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z ]{0,60}$/), (text) => {
        expect(normalizeAndDetectLang({ text }).lang).not.toBe('other');
      }),
    );
  });
});
