import { describe, expect, it } from 'vitest';
import { assemble, diffAgainst, splitRows } from './fragments.mjs';

const sections = [
  { head: '_a.md' },
  { head: '_b.md', prefix: 'b-' },
  { head: '_c.md', prefix: 'c-' },
];
const base = {
  '_a.md': '# Tiêu đề\n\nMở đầu\n',
  '_b.md': '## B\n\n| x | y |\n|---|---|\n',
  '_c.md': '## C\n\n',
};

describe('assemble', () => {
  it('ghép đầu mục + hàng theo tên file, xác định, không phụ thuộc thứ tự khóa', () => {
    const files = {
      ...base,
      'b-2.md': '| 2 | hai |\n',
      'b-1.md': '| 1 | một |\n',
      'c-x.md': '- mục x\n',
    };
    const reversed = Object.fromEntries(Object.entries(files).reverse());
    const out = assemble(files, sections);
    expect(out.problems).toEqual([]);
    expect(out.text).toBe(
      '# Tiêu đề\n\nMở đầu\n\n## B\n\n| x | y |\n|---|---|\n| 1 | một |\n| 2 | hai |\n\n## C\n\n- mục x\n',
    );
    expect(assemble(reversed, sections).text).toBe(out.text);
  });

  it('mục không có hàng vẫn giữ phần đầu (bỏ dòng trống cuối)', () => {
    expect(assemble(base, sections).text).toBe(
      '# Tiêu đề\n\nMở đầu\n\n## B\n\n| x | y |\n|---|---|\n\n## C\n',
    );
  });

  it('hàng nhiều dòng (mục con thụt lề) giữ nguyên trong một file', () => {
    const out = assemble({ ...base, 'c-1.md': '- cha\n  - con\n' }, sections);
    expect(out.text.endsWith('## C\n\n- cha\n  - con\n')).toBe(true);
  });

  it('chuẩn hóa CRLF', () => {
    const out = assemble({ ...base, 'b-1.md': '| 1 | a |\r\n' }, sections);
    expect(out.text).not.toContain('\r');
  });

  it('báo file mồ côi, file rỗng và thiếu phần đầu', () => {
    const { problems } = assemble({ ...base, 'zzz.md': 'x', 'b-1.md': '\n' }, [
      ...sections,
      { head: '_d.md' },
    ]);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('thiếu file phần đầu _d.md'),
        expect.stringContaining('b-1.md: file rỗng'),
        expect.stringContaining('zzz.md: không thuộc mục nào'),
      ]),
    );
  });

  it('phần đầu `_x.md` không bị coi là hàng của mục có tiền tố trùng', () => {
    const { problems } = assemble(base, sections);
    expect(problems).toEqual([]);
  });
});

describe('diffAgainst', () => {
  it('khớp sau khi chuẩn hóa CRLF; lệch thì báo', () => {
    expect(diffAgainst('a\nb\n', 'a\r\nb\r\n')).toBeNull();
    expect(diffAgainst('a\nb\n', 'a\nc\n')).not.toBeNull();
  });
});

describe('splitRows', () => {
  it('bỏ dòng trống, nối dòng thụt lề vào hàng trước', () => {
    expect(splitRows('- a\n\n- b\n  - b1\n| t |\n')).toEqual(['- a', '- b\n  - b1', '| t |']);
  });
});
