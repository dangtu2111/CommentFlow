import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminPool } from './helpers';

/**
 * ACTION-LOGS-ACTOR-INDEX (migration 0031): hai chỉ mục một phần cho truy vấn Nhật ký của Staff
 * (`actor_id = mình` và `on_behalf_of = mình`), khớp `viewerConditions` / policy `action_logs_select`.
 */
let admin: pg.Pool;

beforeAll(() => {
  admin = createAdminPool();
});

afterAll(async () => {
  await admin.end();
});

async function indexInfo(name: string) {
  const { rows } = await admin.query<{ def: string; valid: boolean }>(
    `SELECT pg_get_indexdef(c.oid) AS def, i.indisvalid AS valid
       FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'core' AND c.relname = $1`,
    [name],
  );
  return rows[0];
}

describe('chỉ mục action_logs cho truy vấn Staff (0031)', () => {
  it('action_logs_ws_actor_created_idx: (workspace_id, actor_id, created_at DESC) WHERE actor_type=user', async () => {
    const info = await indexInfo('action_logs_ws_actor_created_idx');
    expect(info?.valid).toBe(true);
    expect(info?.def).toContain('(workspace_id, actor_id, created_at DESC)');
    expect(info?.def).toMatch(/WHERE \(?actor_type = 'user'/);
  });

  it('action_logs_ws_on_behalf_created_idx: (workspace_id, on_behalf_of, created_at DESC) WHERE on_behalf_of IS NOT NULL', async () => {
    const info = await indexInfo('action_logs_ws_on_behalf_created_idx');
    expect(info?.valid).toBe(true);
    expect(info?.def).toContain('(workspace_id, on_behalf_of, created_at DESC)');
    expect(info?.def).toContain('WHERE (on_behalf_of IS NOT NULL)');
  });
});
