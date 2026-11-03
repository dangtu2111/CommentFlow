import { describe, expect, it } from 'vitest';
import { checkMigrations } from './migrations-check.mjs';

const journal = (...tags) => ({ entries: tags.map((tag, idx) => ({ idx, tag })) });

describe('checkMigrations', () => {
  it('xanh khi số liên tục, journal khớp file .sql', () => {
    const tags = ['0000_init', '0001_rls', '0002_x'];
    expect(
      checkMigrations({ journal: journal(...tags), sqlFiles: tags.map((t) => `${t}.sql`) }),
    ).toEqual([]);
  });

  it('đỏ khi hai file trùng số thứ tự (hai nhánh cùng thêm migration)', () => {
    const problems = checkMigrations({
      journal: journal('0000_a', '0001_b', '0001_c'),
      sqlFiles: ['0000_a.sql', '0001_b.sql', '0001_c.sql'],
    });
    expect(problems.join('\n')).toMatch(/trùng/);
  });

  it('đỏ khi số không liên tục (nhảy cóc)', () => {
    const problems = checkMigrations({
      journal: journal('0000_a', '0002_c'),
      sqlFiles: ['0000_a.sql', '0002_c.sql'],
    });
    expect(problems.join('\n')).toMatch(/liên tục/);
  });

  it('đỏ khi có file .sql không nằm trong journal', () => {
    const problems = checkMigrations({
      journal: journal('0000_a'),
      sqlFiles: ['0000_a.sql', '0001_thua.sql'],
    });
    expect(problems.join('\n')).toMatch(/0001_thua\.sql.*không có trong _journal/);
  });

  it('đỏ khi journal có tag mà thiếu file .sql', () => {
    const problems = checkMigrations({
      journal: journal('0000_a', '0001_mat'),
      sqlFiles: ['0000_a.sql'],
    });
    expect(problems.join('\n')).toMatch(/0001_mat.*không có file/);
  });

  it('đỏ khi tag không khớp số thứ tự idx hoặc sai định dạng tên', () => {
    const wrongIdx = checkMigrations({
      journal: { entries: [{ idx: 5, tag: '0000_a' }] },
      sqlFiles: ['0000_a.sql'],
    });
    expect(wrongIdx.join('\n')).toMatch(/idx/);
    const badName = checkMigrations({ journal: journal('init'), sqlFiles: ['init.sql'] });
    expect(badName.join('\n')).toMatch(/định dạng/);
  });
});
