import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  getIntegrationErrorCounts,
  listDeadLetters,
  recordIntegrationIncident,
} from '../src/queries/integration-health';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * ADMIN-INTEGRATION-HEALTH (FR-104, Q-AIH1): chỉ hệ thống ghi sự cố; RLS chéo workspace; chỉ Super Admin đọc tổng hợp
 * xuyên workspace và dead letter (không lộ payload).
 */
const RLS = '42501';
const since = new Date(Date.now() - 24 * 3_600_000);

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let otherOwner: string;
let superAdmin: string;
let supportAdmin: string;
let financeAdmin: string;

async function seedAdmin(role: string | null): Promise<string> {
  const id = await seedUser(admin, `admin-${role}`);
  await admin.query('UPDATE core.users SET is_admin = true, admin_role = $2 WHERE id = $1', [
    id,
    role,
  ]);
  return id;
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  otherOwner = await seedUser(admin, 'otherOwner');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, other, otherOwner, 'owner');
  superAdmin = await seedAdmin('super');
  supportAdmin = await seedAdmin('support');
  financeAdmin = await seedAdmin('finance');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('ghi sự cố', () => {
  it('worker (hệ thống) ghi được; thông báo đã che PII/token trước khi vào DB', async () => {
    const blob = 'q'.repeat(40);
    await db.withJob(ws, (tx) =>
      recordIntegrationIncident(tx, ws, {
        provider: 'shopify',
        kind: 'api',
        code: 'HTTP_500',
        message: `lỗi khách a@b.vn token ${blob}`,
      }),
    );
    const rows = await admin.query(
      'SELECT message FROM cf.integration_incidents WHERE workspace_id = $1',
      [ws],
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const row of rows.rows) {
      expect(row.message).not.toContain('a@b.vn');
      expect(row.message).not.toContain(blob);
    }
  });

  it('đường người dùng/web (không phải hệ thống) không ghi được', async () => {
    const code = await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        recordIntegrationIncident(tx, ws, {
          provider: 'llm',
          kind: 'api',
          code: 'X',
          message: 'giả',
        }),
      ),
    );
    expect(code).toBe(RLS);
  });

  it('không ghi sang workspace khác với ngữ cảnh hiện tại', async () => {
    const code = await expectRejectCode(
      db.withJob(ws, (tx) =>
        recordIntegrationIncident(tx, other, {
          provider: 'llm',
          kind: 'api',
          code: 'X',
          message: 'chéo',
        }),
      ),
    );
    expect(code).toBe(RLS);
  });

  it('mã sự cố dạng văn bản tự do bị từ chối trước khi vào DB', async () => {
    await expect(
      db.withJob(ws, (tx) =>
        recordIntegrationIncident(tx, ws, {
          provider: 'llm',
          kind: 'api',
          code: 'khách a@b.vn lỗi',
          message: 'x',
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('Super Admin gọi trong ngữ cảnh có workspace bị từ chối', async () => {
    expect(
      await expectRejectCode(
        db.withActor(ws, superAdmin, (tx) => getIntegrationErrorCounts(tx, since)),
      ),
    ).toBe(RLS);
  });

  it('nhà cung cấp lạ bị CHECK từ chối', async () => {
    const code = await expectRejectCode(
      db.withJob(ws, (tx) =>
        recordIntegrationIncident(tx, ws, {
          provider: 'zzz',
          kind: 'api',
          code: 'X',
          message: 'lạ',
        }),
      ),
    );
    expect(code).toBe('23514');
  });

  it('workspace khác không thấy sự cố của workspace này (RLS)', async () => {
    const seen = await db.withActor(other, otherOwner, (tx) =>
      tx.execute<{ workspace_id: string }>(
        sql`SELECT workspace_id FROM cf.integration_incidents WHERE workspace_id = ${ws}::uuid`,
      ),
    );
    expect(seen.rows).toHaveLength(0);
    const own = await db.withActor(ws, owner, (tx) =>
      tx.execute<{ workspace_id: string }>(sql`SELECT workspace_id FROM cf.integration_incidents`),
    );
    expect(own.rows.length).toBeGreaterThan(0);
    expect(own.rows.every((r) => r.workspace_id === ws)).toBe(true);
  });
});

describe('đọc tổng hợp chỉ Super Admin', () => {
  it('super đọc được tổng hợp xuyên workspace', async () => {
    await db.withJob(other, (tx) =>
      recordIntegrationIncident(tx, other, {
        provider: 'shopify',
        kind: 'api',
        code: 'HTTP_429',
        message: 'quá tải',
      }),
    );
    const counts = await db.withUser(superAdmin, (tx) => getIntegrationErrorCounts(tx, since));
    const shopify = counts.find((c) => c.provider === 'shopify' && c.kind === 'api');
    expect(shopify?.errorCount).toBeGreaterThanOrEqual(2);
    expect(shopify?.workspaceCount).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ['support', () => supportAdmin],
    ['finance', () => financeAdmin],
    ['Owner workspace', () => owner],
  ])('%s bị từ chối (42501)', async (_label, who) => {
    expect(
      await expectRejectCode(db.withUser(who(), (tx) => getIntegrationErrorCounts(tx, since))),
    ).toBe(RLS);
    expect(await expectRejectCode(db.withUser(who(), (tx) => listDeadLetters(tx, 5)))).toBe(RLS);
  });

  it('không có người dùng / ngữ cảnh hệ thống bị từ chối', async () => {
    expect(
      await expectRejectCode(db.withSystem((tx) => getIntegrationErrorCounts(tx, since))),
    ).toBe(RLS);
    expect(await expectRejectCode(db.withJob(ws, (tx) => listDeadLetters(tx, 5)))).toBe(RLS);
  });

  it('dead letter: chỉ dòng status=dead, không lộ payload, che PII ở lỗi', async () => {
    const hash = `dl-${randomUUID()}`;
    await admin.query(
      `INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload, status, attempts, error)
       VALUES ($1, 'facebook', $2, '{"ten":"Khach Bi Mat"}'::jsonb, 'dead', 5, 'gửi lỗi cho a@b.vn')`,
      [ws, hash],
    );
    await admin.query(
      `INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload, status)
       VALUES ($1, 'facebook', $2, '{}'::jsonb, 'done')`,
      [ws, `ok-${randomUUID()}`],
    );
    const letters = await db.withUser(superAdmin, (tx) => listDeadLetters(tx, 200));
    expect(letters.length).toBeGreaterThan(0);
    expect(letters.every((l) => l.attempts >= 0)).toBe(true);
    const mine = letters.find((l) => l.error?.includes('gửi lỗi'));
    expect(mine?.error).not.toContain('a@b.vn');
    expect(JSON.stringify(letters)).not.toContain('Khach Bi Mat');
  });
});
