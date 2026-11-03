import { describe, expect, it } from 'vitest';
import { flattenMessages, placeholdersOf } from './message-utils';
import en from './messages/en.json';
import vi from './messages/vi.json';

describe('chuỗi giao diện vi/en', () => {
  const viFlat = flattenMessages(vi);
  const enFlat = flattenMessages(en);

  it('hai ngôn ngữ có đúng cùng một bộ khóa', () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(viFlat).sort());
  });

  it('không có chuỗi rỗng', () => {
    for (const [key, value] of [...Object.entries(viFlat), ...Object.entries(enFlat)]) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('mỗi khóa dùng cùng các biến {tên} ở hai ngôn ngữ', () => {
    for (const key of Object.keys(viFlat)) {
      expect(placeholdersOf(enFlat[key] ?? ''), key).toEqual(placeholdersOf(viFlat[key] ?? ''));
    }
  });
});

describe('flattenMessages', () => {
  it('làm phẳng khóa lồng nhau bằng dấu chấm', () => {
    expect(flattenMessages({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({
      'a.b': 'x',
      'a.c.d': 'y',
      e: 'z',
    });
  });
});

describe('placeholdersOf', () => {
  it('lấy tên biến ICU đơn giản, bỏ trùng và sắp xếp', () => {
    expect(placeholdersOf('Xin chào {name}, bạn có {count} tin, {name}')).toEqual([
      'count',
      'name',
    ]);
  });
});
