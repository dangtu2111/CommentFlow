import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database, FlowDb } from '../src/client';
import { recordWebhookEvent } from '../src/webhook-events';
import {
  createAdminPool,
  createAppDb,
  newId,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * WH-INGEST (FR-020/021): cf.record_webhook_event — điểm ghi sự kiện webhook KHÔNG đòi đăng nhập (chữ ký kiểm ở mã web).
 * Chỉ chạy ở ngữ cảnh trần (withSystem: không workspace, không người dùng, không hệ thống-job). Rải sự kiện theo kênh
 * `connected` + `webhook_subscribed`; một Page ở nhiều workspace → mỗi workspace một dòng; chưa map → một dòng NULL.
 */
let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let owner: string;

const page = () => `page-${newId()}`;
const hash = () => `h-${newId()}`;

async function seedChannel(
  workspaceId: string,
  externalId: string,
  options: { status?: string; subscribed?: boolean } = {},
): Promise<string> {
  const result = await admin.query(
    `INSERT INTO cf.channels (workspace_id, platform, external_id, name, status, webhook_subscribed)
     VALUES ($1, 'facebook', $2, 'Page', $3, $4) RETURNING id`,
    [workspaceId, externalId, options.status ?? 'connected', options.subscribed ?? true],
  );
  return result.rows[0].id;
}

const record = (externalId: string, eventHash: string, payload: unknown = { a: 1 }) =>
  db.withSystem((tx) =>
    recordWebhookEvent(tx, {
      platform: 'facebook',
      pageExternalId: externalId,
      eventHash,
      payload,
    }),
  );

const rowsOf = async (eventHash: string) =>
  (
    await admin.query(
      'SELECT workspace_id, status, payload FROM cf.webhook_events WHERE event_hash = $1 ORDER BY workspace_id NULLS FIRST',
      [eventHash],
    )
  ).rows;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  await seedMember(admin, wsA, owner, 'owner');
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-021 cf.record_webhook_event — ghi và rải sự kiện theo kênh', () => {
  it('Page map vào một kênh connected + subscribed → một dòng của workspace đó, trả (event_id, workspace_id)', async () => {
    const externalId = page();
    await seedChannel(wsA, externalId);
    const h = hash();
    const result = await record(externalId, h, { comment: 'x' });
    expect(result).toHaveLength(1);
    expect(result[0]?.workspaceId).toBe(wsA);
    const rows = await rowsOf(h);
    expect(rows).toEqual([{ workspace_id: wsA, status: 'received', payload: { comment: 'x' } }]);
  });

  it('gửi lại CÙNG sự kiện → không dòng mới, không trả gì (idempotent)', async () => {
    const externalId = page();
    await seedChannel(wsA, externalId);
    const h = hash();
    expect(await record(externalId, h)).toHaveLength(1);
    expect(await record(externalId, h)).toHaveLength(0);
    expect(await rowsOf(h)).toHaveLength(1);
  });

  it('một Page ở HAI workspace → hai dòng (mỗi workspace một bản), trả cả hai; gửi lại không thêm', async () => {
    const externalId = page();
    await seedChannel(wsA, externalId);
    await seedChannel(wsB, externalId);
    const h = hash();
    const first = await record(externalId, h);
    expect(new Set(first.map((r) => r.workspaceId))).toEqual(new Set([wsA, wsB]));
    expect(await record(externalId, h)).toHaveLength(0);
    expect(await rowsOf(h)).toHaveLength(2);
  });

  it('kênh chưa đăng ký webhook / không connected / Page lạ → một dòng workspace NULL, KHÔNG trả (không enqueue); gửi lại vẫn một dòng', async () => {
    const notSubscribed = page();
    const expired = page();
    const revoked = page();
    await seedChannel(wsA, notSubscribed, { subscribed: false });
    await seedChannel(wsA, expired, { status: 'expired' });
    await seedChannel(wsA, revoked, { status: 'revoked' });
    for (const externalId of [notSubscribed, expired, revoked, page()]) {
      const h = hash();
      expect(await record(externalId, h)).toHaveLength(0);
      expect(await record(externalId, h)).toHaveLength(0);
      const rows = await rowsOf(h);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.workspace_id).toBeNull();
    }
  });

  it('chỉ rải vào kênh KHỚP nền tảng + Page ID: kênh khác trong cùng workspace không nhận', async () => {
    const mine = page();
    const other = page();
    await seedChannel(wsA, mine);
    await seedChannel(wsA, other);
    const h = hash();
    const result = await record(mine, h);
    expect(result).toHaveLength(1);
    expect((await rowsOf(h)).map((r) => r.workspace_id)).toEqual([wsA]);
  });

  it('nền tảng sai (không thuộc danh sách) → bị CHECK từ chối, không ghi gì', async () => {
    const error = await db
      .withSystem((tx) =>
        recordWebhookEvent(tx, {
          platform: 'zalo' as never,
          pageExternalId: page(),
          eventHash: hash(),
          payload: {},
        }),
      )
      .then(
        () => undefined,
        (e: { cause?: { code?: string }; code?: string }) => e.cause?.code ?? e.code,
      );
    expect(error).toBe('23514');
  });
});

describe('FR-020 quyền gọi hàm: chỉ ngữ cảnh trần (route webhook)', () => {
  const call = (run: (fn: (tx: Database) => Promise<unknown>) => Promise<unknown>) =>
    run((tx) =>
      recordWebhookEvent(tx, {
        platform: 'facebook',
        pageExternalId: page(),
        eventHash: hash(),
        payload: {},
      }),
    ).then(
      () => 'ok',
      (e: { cause?: { code?: string }; code?: string }) => e.cause?.code ?? e.code,
    );

  it('withWorkspace / withActor (Owner) / withJob (hệ thống) → 42501: không đường nào khác tiêm được sự kiện', async () => {
    expect(await call((fn) => db.withWorkspace(wsA, fn))).toBe('42501');
    expect(await call((fn) => db.withActor(wsA, owner, fn))).toBe('42501');
    expect(await call((fn) => db.withJob(wsA, fn))).toBe('42501');
    expect(await call((fn) => db.withUser(owner, fn))).toBe('42501');
  });

  it('withSystem (ngữ cảnh trần) được gọi', async () => {
    expect(await call((fn) => db.withSystem(fn))).toBe('ok');
  });

  it('PUBLIC không có EXECUTE; hàm DEFINER có search_path cố định', async () => {
    const row = (
      await admin.query(
        `SELECT has_function_privilege('public', p.oid, 'EXECUTE') AS pub,
                has_function_privilege('cf_app', p.oid, 'EXECUTE') AS app,
                p.prosecdef AS definer, p.proconfig::text AS config
           FROM pg_proc p WHERE p.pronamespace = 'cf'::regnamespace AND p.proname = 'record_webhook_event'`,
      )
    ).rows[0];
    expect(row.pub).toBe(false);
    expect(row.app).toBe(true);
    expect(row.definer).toBe(true);
    expect(row.config).toContain('search_path=pg_catalog, core, cf, pg_temp');
  });

  it('dòng chưa map (workspace NULL) không workspace nào đọc được qua cf_app', async () => {
    const externalId = page();
    const h = hash();
    await record(externalId, h);
    const seen = await db.withActor(
      wsA,
      owner,
      async (tx) =>
        (await tx.execute(sql`SELECT 1 FROM cf.webhook_events WHERE event_hash = ${h}`)).rows
          .length,
    );
    expect(seen).toBe(0);
  });
});
