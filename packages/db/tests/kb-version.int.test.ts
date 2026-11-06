import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { getCurrentKbVersion } from '../src/queries/kb-version';
import { createAdminPool, createAppDb, seedWorkspace } from './helpers';

/** PIPE-CACHE-EXACT (FR-026): kb_version trong khóa cache = số phiên bản lớn nhất của đúng workspace. */

let admin: pg.Pool;
let db: FlowDb;

beforeAll(() => {
  admin = createAdminPool();
  db = createAppDb();
});

afterAll(async () => {
  await admin.end();
});

describe('FR-026 getCurrentKbVersion', () => {
  it('chưa xuất bản → 0; có nhiều bản → số lớn nhất; workspace khác không lộ', async () => {
    const wsA = await seedWorkspace(admin);
    const wsB = await seedWorkspace(admin);
    expect(await db.withWorkspace(wsA, (tx) => getCurrentKbVersion(tx, wsA))).toBe(0);

    await admin.query('INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1), ($1, 2)', [
      wsA,
    ]);
    await admin.query('INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 7)', [wsB]);

    expect(await db.withWorkspace(wsA, (tx) => getCurrentKbVersion(tx, wsA))).toBe(2);
    expect(await db.withWorkspace(wsB, (tx) => getCurrentKbVersion(tx, wsB))).toBe(7);
    // Ngữ cảnh A hỏi id của B: RLS chặn → 0 (không lộ số của B).
    expect(await db.withWorkspace(wsA, (tx) => getCurrentKbVersion(tx, wsB))).toBe(0);
  });
});
