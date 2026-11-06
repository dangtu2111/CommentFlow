import { describe, expect, it } from 'vitest';
import { checkFragments } from './docs-check.mjs';
import { DOCS_TARGETS } from './docs-targets.mjs';

const target = (label) => DOCS_TARGETS.find((t) => t.label === label);

describe('checkFragments — quyet-dinh', () => {
  const base = { '_bang.md': '| Mã |\n|---|\n', '_docs.md': '## Docs\n\n' };

  it('đạt khi hàng đúng định dạng và mã không trùng', () => {
    const files = {
      ...base,
      'q-a1.md': '| Q-A1 | một |\n',
      'q-a2.md': '| Q-A2 | hai |\n',
      'docs-11-05-x.md': '- 05/11: đổi docs\n',
    };
    expect(checkFragments(target('quyet-dinh'), files)).toEqual([]);
  });

  it('báo mã Q trùng ở hai file khác tên', () => {
    const files = { ...base, 'q-a1.md': '| Q-A1 | một |\n', 'q-a1b.md': '| Q-A1 | trùng |\n' };
    expect(checkFragments(target('quyet-dinh'), files)).toEqual([
      expect.stringContaining('trùng mã Q-A1'),
    ]);
  });

  it('báo hàng không phải dòng bảng Q', () => {
    const files = { ...base, 'q-x.md': 'không phải hàng bảng\n' };
    expect(checkFragments(target('quyet-dinh'), files)).toEqual([
      expect.stringContaining('q-x.md: dòng đầu phải là'),
    ]);
  });
});

describe('checkFragments — kiem-tra-tay', () => {
  const base = { '_trang-thai.md': '| KT |\n', '_muc.md': '# Mục\n\n', '_mau.md': '## Mẫu\n' };

  it('mã lấy từ tên file phải khớp dòng đầu', () => {
    const files = {
      ...base,
      'kt-001.md': '## KT-001 — Đăng nhập\nbước\n',
      'tt-001.md': '| KT-001 | chưa |\n',
    };
    expect(checkFragments(target('kiem-tra-tay'), files)).toEqual([]);
  });

  it('báo dòng đầu lệch mã trong tên file', () => {
    const files = { ...base, 'kt-002.md': '## KT-999 — sai\n', 'tt-002.md': '| KT-002 | chưa |\n' };
    expect(checkFragments(target('kiem-tra-tay'), files)).toEqual([
      expect.stringContaining('kt-002.md: dòng đầu phải bắt đầu bằng "## KT-002 — "'),
    ]);
  });
});

describe('checkFragments — codemap và can-ban-cung-cap', () => {
  it('codemap: báo file mồ côi và hàng sai định dạng', () => {
    const files = {
      '_00-dau.md': '# Codemap\n',
      '_lenh.md': '| a |\n',
      '_cay.md': '| b |\n',
      '_mien.md': '| c |\n',
      '_diem-vao.md': '| d |\n',
      '_bay.md': '## Bẫy\n\n',
      'bay-x.md': 'thiếu gạch đầu dòng\n',
      'la.md': '| x |\n',
    };
    const problems = checkFragments(target('codemap'), files);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bay-x.md: dòng đầu phải là'),
        expect.stringContaining('la.md: không thuộc mục nào'),
      ]),
    );
  });

  it('can-ban-cung-cap: mục phải bắt đầu bằng "## "', () => {
    const files = { '_00-dau.md': '# CBCC\n\n', '01-a.md': 'thiếu tiêu đề\n' };
    expect(checkFragments(target('can-ban-cung-cap'), files)).toEqual([
      expect.stringContaining('01-a.md: dòng đầu phải là'),
    ]);
  });
});
