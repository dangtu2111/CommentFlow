import { describe, expect, it } from 'vitest';
import { hashMigrationSql, unrecordedMigrationTags } from './migration-drift';

const journal = [{ tag: '0001_a' }, { tag: '0002_b' }, { tag: '0003_c' }];
const files: Record<string, string> = {
  '0001_a': 'SELECT 1;',
  '0002_b': 'SELECT 2;',
  '0003_c': 'SELECT 3;',
};
const read = (tag: string) => files[tag] as string;

describe('hashMigrationSql — cùng cách drizzle ghi sổ (sha256 hex của nội dung file)', () => {
  it('ổn định, khác nội dung thì khác mã', () => {
    expect(hashMigrationSql('SELECT 1;')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashMigrationSql('SELECT 1;')).toBe(hashMigrationSql('SELECT 1;'));
    expect(hashMigrationSql('SELECT 1;')).not.toBe(hashMigrationSql('SELECT 2;'));
  });
});

describe('unrecordedMigrationTags — phát hiện DB lệch với file migration', () => {
  it('mọi file đã ghi sổ → rỗng', () => {
    const recorded = new Set(Object.values(files).map(hashMigrationSql));
    expect(unrecordedMigrationTags(journal, read, recorded)).toEqual([]);
  });

  it('file bị sửa sau khi áp, hoặc chưa từng áp (bị bỏ qua vì mốc thời gian) → nêu đúng tên, giữ thứ tự journal', () => {
    const recorded = new Set([
      hashMigrationSql('SELECT 1;'),
      hashMigrationSql('SELECT 2 /* bản cũ */;'),
    ]);
    expect(unrecordedMigrationTags(journal, read, recorded)).toEqual(['0002_b', '0003_c']);
  });

  it('sổ trống → mọi file', () => {
    expect(unrecordedMigrationTags(journal, read, new Set())).toEqual([
      '0001_a',
      '0002_b',
      '0003_c',
    ]);
  });
});
