import { describe, expect, it } from 'vitest';
import { isDataStatement, makeReplayable } from './repair-dev';

describe('makeReplayable — viết lại câu migration để chạy lại được trên DB dev', () => {
  it('CREATE FUNCTION → CREATE OR REPLACE FUNCTION', () => {
    expect(
      makeReplayable('CREATE FUNCTION cf.f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;'),
    ).toContain('CREATE OR REPLACE FUNCTION cf.f()');
  });

  it('CREATE POLICY → DROP POLICY IF EXISTS rồi tạo lại (giữ bản hiện tại của file)', () => {
    const out = makeReplayable('CREATE POLICY p_sel ON cf.t FOR SELECT USING (true);');
    expect(out.startsWith('DROP POLICY IF EXISTS p_sel ON cf.t;')).toBe(true);
    expect(out).toContain('CREATE POLICY p_sel ON cf.t FOR SELECT');
  });

  it('CREATE TRIGGER → DROP TRIGGER IF EXISTS rồi tạo lại', () => {
    const out = makeReplayable(
      'CREATE TRIGGER trg BEFORE INSERT ON cf.t FOR EACH ROW EXECUTE FUNCTION cf.f();',
    );
    expect(out.startsWith('DROP TRIGGER IF EXISTS trg ON cf.t;')).toBe(true);
  });

  it('câu khác giữ nguyên', () => {
    expect(makeReplayable('GRANT SELECT ON cf.t TO cf_app;')).toBe(
      'GRANT SELECT ON cf.t TO cf_app;',
    );
  });
});

describe('isDataStatement — câu sửa dữ liệu không được phát lại', () => {
  it('nhận UPDATE/DELETE/INSERT/TRUNCATE (kể cả sau dòng chú thích); DDL thì không', () => {
    for (const s of [
      'UPDATE cf.t SET a = 1;',
      '-- ghi chú\nDELETE FROM cf.t;',
      'INSERT INTO cf.t VALUES (1);',
      'TRUNCATE cf.t;',
    ]) {
      expect(isDataStatement(s)).toBe(true);
    }
    for (const s of [
      'ALTER TABLE cf.t ADD COLUMN a int;',
      'CREATE INDEX i ON cf.t (a);',
      'GRANT SELECT ON cf.t TO cf_app;',
    ]) {
      expect(isDataStatement(s)).toBe(false);
    }
  });
});
