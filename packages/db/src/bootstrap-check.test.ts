import { describe, expect, it } from 'vitest';
import {
  type BootstrapState,
  ensureBootstrap,
  evaluateBootstrap,
  formatBootstrapProblem,
  REQUIRED_EXTENSIONS,
  REQUIRED_ROLES,
} from './bootstrap-check';

const ok: BootstrapState = {
  installedExtensions: [...REQUIRED_EXTENSIONS, 'plpgsql'],
  availableExtensions: [...REQUIRED_EXTENSIONS, 'plpgsql'],
  roles: [...REQUIRED_ROLES, 'postgres'],
};

describe('evaluateBootstrap (DB-BOOTSTRAP: tiền đề của migration 0000)', () => {
  it('đủ extension và role → không thiếu gì', () => {
    expect(evaluateBootstrap(ok)).toEqual({
      installable: [],
      unavailable: [],
      missingRoles: [],
      ok: true,
    });
  });

  it('extension chưa cài nhưng máy chủ có sẵn → cài được (installable); không có trên máy chủ → unavailable', () => {
    const r = evaluateBootstrap({
      ...ok,
      installedExtensions: ['plpgsql', 'unaccent'],
      availableExtensions: ['plpgsql', 'unaccent', 'citext', 'pg_trgm'],
    });
    expect(r.installable.sort()).toEqual(['citext', 'pg_trgm']);
    expect(r.unavailable).toEqual(['vector']);
    expect(r.ok).toBe(false);
  });

  it('thiếu role → liệt kê đúng tên role', () => {
    const r = evaluateBootstrap({ ...ok, roles: ['cf_owner', 'cf_app'] });
    expect(r.missingRoles).toEqual(['cf_auth', 'cf_worker']);
    expect(r.ok).toBe(false);
  });
});

describe('formatBootstrapProblem', () => {
  it('nêu từng thiếu sót và cách xử lý bằng tiếng Việt, KHÔNG có mật khẩu/chuỗi kết nối', () => {
    const text = formatBootstrapProblem({
      installable: ['citext'],
      unavailable: ['vector'],
      missingRoles: ['cf_app'],
      ok: false,
    });
    expect(text).toContain('citext');
    expect(text).toContain('CREATE EXTENSION IF NOT EXISTS citext');
    expect(text).toContain('vector');
    expect(text).toContain('pgvector');
    expect(text).toContain('cf_app');
    expect(text).toContain('infra/postgres/init');
    expect(text).not.toMatch(/password|postgres(ql)?:\/\//i);
  });

  it('không thiếu gì → chuỗi rỗng', () => {
    expect(
      formatBootstrapProblem({ installable: [], unavailable: [], missingRoles: [], ok: true }),
    ).toBe('');
  });
});

/** DB giả: trả danh sách theo trạng thái hiện có; `CREATE EXTENSION` cập nhật trạng thái (hoặc ném khi thiếu quyền). */
function fakeDb(state: BootstrapState, options: { canCreate: boolean }) {
  const installed = [...state.installedExtensions];
  const created: string[] = [];
  return {
    created,
    async query(sql: string) {
      const create = /^CREATE EXTENSION IF NOT EXISTS (\w+)$/.exec(sql);
      if (create) {
        if (!options.canCreate) throw new Error('permission denied');
        installed.push(create[1] as string);
        created.push(create[1] as string);
        return { rows: [] };
      }
      if (sql.includes('pg_extension')) return { rows: installed.map((name) => ({ name })) };
      if (sql.includes('pg_available_extensions')) {
        return { rows: state.availableExtensions.map((name) => ({ name })) };
      }
      return { rows: state.roles.map((name) => ({ name })) };
    },
  };
}

describe('ensureBootstrap', () => {
  it('đủ tiền đề → không làm gì', async () => {
    const db = fakeDb(ok, { canCreate: true });
    await expect(ensureBootstrap(db as never)).resolves.toBeUndefined();
    expect(db.created).toEqual([]);
  });

  it('extension cài được và có quyền → tự CREATE EXTENSION IF NOT EXISTS rồi qua', async () => {
    const db = fakeDb(
      { ...ok, installedExtensions: ['plpgsql', 'unaccent', 'pg_trgm', 'vector'] },
      { canCreate: true },
    );
    await expect(ensureBootstrap(db as never)).resolves.toBeUndefined();
    expect(db.created).toEqual(['citext']);
  });

  it('thiếu quyền cài → ném thông điệp rõ (kèm lệnh), không lộ lỗi gốc', async () => {
    const db = fakeDb({ ...ok, installedExtensions: ['plpgsql'] }, { canCreate: false });
    const error = await ensureBootstrap(db as never).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('CREATE EXTENSION IF NOT EXISTS citext');
    expect((error as Error).message).not.toContain('permission denied');
  });

  it('thiếu role → ném, nêu tên role', async () => {
    const db = fakeDb({ ...ok, roles: ['cf_owner'] }, { canCreate: true });
    await expect(ensureBootstrap(db as never)).rejects.toThrow(/cf_app, cf_auth, cf_worker/);
  });

  it('máy chủ không có pgvector → ném, hướng dẫn cài ở mức máy chủ', async () => {
    const db = fakeDb(
      {
        ...ok,
        installedExtensions: ['plpgsql', 'citext', 'unaccent', 'pg_trgm'],
        availableExtensions: ['plpgsql', 'citext', 'unaccent', 'pg_trgm'],
      },
      { canCreate: true },
    );
    await expect(ensureBootstrap(db as never)).rejects.toThrow(/pgvector/);
  });
});
