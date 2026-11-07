import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANG_GROUPS, parseDataset, serializeDataset } from './dataset';
import { generateSynthetic } from './synthetic';

const line = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'a1',
    source: 'synthetic',
    group: 'vi',
    text: 'giá bao nhiêu',
    expected: { lang: 'vi', label: 'price', action: 'answer' },
    ...over,
  });

describe('EVAL-RUNNER bộ mẫu (docs/14 §4.1)', () => {
  it('đọc JSONL, điền mặc định, bỏ dòng trống', () => {
    const [sample] = parseDataset(`\n${line()}\n\n`);
    expect(sample).toMatchObject({
      id: 'a1',
      category: 'normal',
      hasMedia: false,
      expected: { extract: {}, mustContain: [], forbidden: [] },
    });
  });

  it('lỗi nêu SỐ DÒNG và tên trường, không in nội dung mẫu', () => {
    expect(() => parseDataset(`${line()}\nkhông phải json 0901234567`)).toThrow(
      'Dòng 2: không phải JSON',
    );
    expect(() => parseDataset(line({ group: 'fr' }))).toThrow('Dòng 1: sai định dạng ở "group"');
    expect(() =>
      parseDataset(line({ expected: { lang: 'vi', label: 'price', action: 'bay' } })),
    ).toThrow('expected.action');
    try {
      parseDataset(line({ text: 'bí mật khách 0901234567', group: 'fr' }));
    } catch (error) {
      expect(String((error as Error).message)).not.toContain('0901234567');
    }
  });

  it('từ chối id trùng và trường lạ trong extract', () => {
    expect(() => parseDataset(`${line()}\n${line()}`)).toThrow('trùng id "a1"');
    expect(() =>
      parseDataset(
        line({ expected: { lang: 'vi', label: 'price', action: 'answer', extract: { sai: 1 } } }),
      ),
    ).toThrow('Dòng 1');
  });

  it('serialize rồi parse lại cho cùng kết quả', () => {
    const samples = generateSynthetic();
    expect(parseDataset(serializeDataset(samples))).toEqual(samples);
  });
});

describe('bộ synthetic', () => {
  const samples = generateSynthetic();

  it('4 nhóm ngôn ngữ × 14 tình huống, id duy nhất, đều đánh dấu synthetic', () => {
    expect(samples).toHaveLength(56);
    expect(new Set(samples.map((sample) => sample.id)).size).toBe(56);
    expect(new Set(samples.map((sample) => sample.source))).toEqual(new Set(['synthetic']));
    for (const group of LANG_GROUPS) {
      expect(samples.filter((sample) => sample.group === group)).toHaveLength(14);
    }
  });

  it('có đủ các loại: hỏi lại, pháp lý, an toàn (injection, sản phẩm không có)', () => {
    const categories = new Set(samples.map((sample) => sample.category));
    expect(categories).toEqual(new Set(['normal', 'clarify', 'legal', 'safety']));
    expect(samples.some((sample) => sample.expected.forbidden.includes('10.000'))).toBe(true);
  });

  it('nhóm tiếng Anh nói màu bằng tiếng Anh; nhóm trộn dự kiến trả lời tiếng Việt', () => {
    const en = samples.find((sample) => sample.id.startsWith('syn-en-02'));
    expect(en?.expected.extract.color).toBe('black');
    expect(samples.find((sample) => sample.id.startsWith('syn-mixed-01'))?.expected.lang).toBe(
      'vi',
    );
  });

  it('tệp datasets/synthetic-demo.jsonl khớp bộ sinh (chạy `pnpm gen:synthetic` nếu lệch)', () => {
    const file = readFileSync(resolve(__dirname, '../datasets/synthetic-demo.jsonl'), 'utf8');
    expect(file).toBe(serializeDataset(samples));
  });
});

describe('mẫu nhiều lượt (thread, Q-POR12)', () => {
  const line = (thread: unknown) =>
    JSON.stringify({
      id: 'mt1',
      source: 'synthetic',
      group: 'vi',
      text: 'M đen',
      thread,
      expected: { lang: 'vi', label: 'advice', action: 'answer' },
    });

  it('đọc được thread (khách/shop); thiếu thread vẫn là mẫu một lượt', () => {
    const [sample] = parseDataset(
      line([
        { from: 'customer', text: 'áo thun basic giá bn?' },
        { from: 'shop', text: 'Dạ bạn chọn size và màu nào ạ?' },
      ]),
    );
    expect(sample?.thread).toHaveLength(2);
    const [single] = parseDataset(
      JSON.stringify({
        id: 's',
        source: 'synthetic',
        group: 'vi',
        text: 'x',
        expected: { lang: 'vi', label: 'price', action: 'answer' },
      }),
    );
    expect(single?.thread).toBeUndefined();
  });

  it('từ chối thread quá 5 lượt hoặc sai người nói; lỗi nêu số dòng, không in nội dung', () => {
    const six = Array.from({ length: 6 }, () => ({ from: 'customer', text: 'a' }));
    expect(() => parseDataset(line(six))).toThrow(/Dòng 1/);
    expect(() => parseDataset(line([{ from: 'bot', text: 'a' }]))).toThrow(/Dòng 1/);
  });
});
