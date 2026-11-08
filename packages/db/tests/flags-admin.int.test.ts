import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { applyFlagChange } from '../src/flags-admin';
import { createAdminPool, createAppDb, seedWorkspace } from './helpers';

/** flags:set trên DB test: ghi default_on / override theo workspace, idempotent; đọc lại bằng đường runtime (cf_app). */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
const KEY = 'cf.test.flags_admin';

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb();
  ws = await seedWorkspace(admin);
});
afterAll(async () => {
  await admin.query('DELETE FROM core.feature_flags WHERE key = $1', [KEY]);
  await db.close();
  await admin.end();
});

const change = (over: Partial<Parameters<typeof applyFlagChange>[1]>) => ({
  key: KEY,
  enabled: true,
  workspaceId: null,
  kind: 'ops' as const,
  reason: null,
  ...over,
});

describe('applyFlagChange', () => {
  it('toàn hệ thống: tạo cờ nếu chưa có rồi đặt default_on; chạy lại không lỗi', async () => {
    await applyFlagChange(admin, change({ enabled: true }));
    await applyFlagChange(admin, change({ enabled: true }));
    const row = (
      await admin.query('SELECT default_on, kind FROM core.feature_flags WHERE key = $1', [KEY])
    ).rows[0];
    expect(row).toEqual({ default_on: true, kind: 'ops' });
    await applyFlagChange(admin, change({ enabled: false }));
    expect(
      (await admin.query('SELECT default_on FROM core.feature_flags WHERE key = $1', [KEY])).rows[0]
        .default_on,
    ).toBe(false);
  });

  it('theo workspace: override upsert; đường runtime (cf_app) đọc được qua withWorkspace', async () => {
    await applyFlagChange(admin, change({ enabled: true, workspaceId: ws, reason: 'thử' }));
    await applyFlagChange(admin, change({ enabled: false, workspaceId: ws }));
    const rows = await db.withWorkspace(ws, async (tx) => {
      const { sql } = await import('drizzle-orm');
      return (
        await tx.execute(
          sql`SELECT enabled, reason FROM core.feature_flag_overrides WHERE flag_key = ${KEY}`,
        )
      ).rows;
    });
    expect(rows).toEqual([{ enabled: false, reason: null }]);
  });

  it('cờ release tạo mới có hạn xóa (ràng buộc DB)', async () => {
    const key = `${KEY}.release`;
    try {
      await applyFlagChange(admin, change({ key, kind: 'release' }));
      const row = (
        await admin.query(
          'SELECT expires_at IS NOT NULL AS has_expiry FROM core.feature_flags WHERE key = $1',
          [key],
        )
      ).rows[0];
      expect(row.has_expiry).toBe(true);
    } finally {
      await admin.query('DELETE FROM core.feature_flags WHERE key = $1', [key]);
    }
  });
});
