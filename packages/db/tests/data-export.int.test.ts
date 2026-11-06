import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  claimDataExport,
  completeDataExport,
  expireDataExports,
  failDataExport,
  listDataExports,
  readCommentsPage,
  readLeadsPage,
  requestDataExport,
} from '../src/queries/data-export';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * DATA-EXPORT (FR-094, Q-EXP1, migration 0055): chỉ Owner tạo yêu cầu; Staff/người ngoài/workspace khác bị RLS chặn;
 * chỉ hệ thống đổi trạng thái; một yêu cầu đang hoạt động/workspace và ≤ 5/24 giờ; cf_app không DELETE.
 */
const RLS = '42501';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;

const request = (w: string, u: string) => db.withActor(w, u, (tx) => requestDataExport(tx, w, u));

async function reset(workspace: string): Promise<void> {
  await admin.query('DELETE FROM core.data_exports WHERE workspace_id = $1', [workspace]);
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'expOwner');
  staff = await seedUser(admin, 'expStaff');
  otherOwner = await seedUser(admin, 'expOtherOwner');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-094 yêu cầu xuất dữ liệu: quyền và giới hạn', () => {
  it('FR-094 Owner tạo được; Staff bị RLS chặn; Owner workspace khác không tạo cho workspace này', async () => {
    const created = await request(ws, owner);
    expect(created.outcome).toBe('created');
    await reset(ws);
    expect(await expectRejectCode(request(ws, staff))).toBe(RLS);
    expect(await expectRejectCode(request(ws, otherOwner))).toBe(RLS);
  });

  it('FR-094 requested_by không giả danh người khác được', async () => {
    const r = db.withActor(ws, owner, (tx) => requestDataExport(tx, ws, staff));
    expect(await expectRejectCode(r)).toBe(RLS);
  });

  it('FR-094 một yêu cầu đang hoạt động mỗi workspace → already_active', async () => {
    await reset(ws);
    expect((await request(ws, owner)).outcome).toBe('created');
    expect((await request(ws, owner)).outcome).toBe('already_active');
    // workspace khác không bị ảnh hưởng
    expect((await request(other, otherOwner)).outcome).toBe('created');
    await reset(other);
  });

  it('FR-094 tối đa 5 yêu cầu/24 giờ → rate_limited', async () => {
    await reset(ws);
    for (let i = 0; i < 5; i += 1) {
      await admin.query(
        "INSERT INTO core.data_exports (workspace_id, requested_by, status) VALUES ($1, $2, 'failed')",
        [ws, owner],
      );
    }
    expect((await request(ws, owner)).outcome).toBe('rate_limited');
    await reset(ws);
  });

  it('FR-094 chỉ Owner đọc danh sách; không thấy chéo workspace; Staff thấy rỗng', async () => {
    await reset(ws);
    await request(ws, owner);
    expect(await db.withActor(ws, owner, (tx) => listDataExports(tx, ws))).toHaveLength(1);
    expect(await db.withActor(ws, staff, (tx) => listDataExports(tx, ws))).toHaveLength(0);
    expect(await db.withActor(other, otherOwner, (tx) => listDataExports(tx, other))).toHaveLength(
      0,
    );
    await reset(ws);
  });

  it('FR-094 cf_app không tự đổi trạng thái, không INSERT cột trạng thái, không DELETE', async () => {
    await reset(ws);
    await request(ws, owner);
    await db.withActor(ws, owner, (tx) =>
      tx.execute(
        sql`UPDATE core.data_exports SET status = 'ready' WHERE workspace_id = ${ws}::uuid`,
      ),
    );
    const rows = await admin.query('SELECT status FROM core.data_exports WHERE workspace_id = $1', [
      ws,
    ]);
    expect(rows.rows[0].status).toBe('pending');
    const insert = db.withActor(ws, owner, (tx) =>
      tx.execute(
        sql`INSERT INTO core.data_exports (workspace_id, requested_by, status) VALUES (${ws}::uuid, ${owner}::uuid, 'ready')`,
      ),
    );
    expect(await expectRejectCode(insert)).toBe(RLS);
    const del = db.withActor(ws, owner, (tx) =>
      tx.execute(sql`DELETE FROM core.data_exports WHERE workspace_id = ${ws}::uuid`),
    );
    expect(await expectRejectCode(del)).toBe(RLS);
    await reset(ws);
  });
});

describe('FR-094 vòng đời yêu cầu (đường hệ thống)', () => {
  it('FR-094 claim → complete; claim lần hai bị từ chối; hết hạn → expired kèm khóa tệp', async () => {
    await reset(ws);
    const created = await request(ws, owner);
    if (created.outcome !== 'created') throw new Error('phải tạo được');
    const id = created.id;
    expect(await db.withJob(ws, (tx) => claimDataExport(tx, ws, id))).toBe(true);
    expect(await db.withJob(ws, (tx) => claimDataExport(tx, ws, id))).toBe(false);
    await db.withJob(ws, (tx) =>
      completeDataExport(tx, ws, id, {
        fileKey: `exports/${ws}/${id}.jsonl`,
        sizeBytes: 10,
        rowCounts: { comments: 1 },
        expiresAt: new Date(Date.now() - 1000),
      }),
    );
    const [row] = await db.withActor(ws, owner, (tx) => listDataExports(tx, ws));
    expect(row).toMatchObject({ status: 'ready', sizeBytes: 10, rowCounts: { comments: 1 } });
    const expired = await db.withSystem((tx) => expireDataExports(tx));
    expect(expired.some((e) => e.id === id && e.fileKey.endsWith('.jsonl'))).toBe(true);
    const after = await admin.query('SELECT status FROM core.data_exports WHERE id = $1', [id]);
    expect(after.rows[0].status).toBe('expired');
    await reset(ws);
  });

  it('FR-094 lỗi → failed với mã ngắn; cho phép yêu cầu mới sau đó', async () => {
    await reset(ws);
    const created = await request(ws, owner);
    if (created.outcome !== 'created') throw new Error('phải tạo được');
    await db.withJob(ws, (tx) => failDataExport(tx, ws, created.id, 'export_failed'));
    const [row] = await db.withActor(ws, owner, (tx) => listDataExports(tx, ws));
    expect(row).toMatchObject({ status: 'failed', errorCode: 'export_failed' });
    expect((await request(ws, owner)).outcome).toBe('created');
    await reset(ws);
  });

  it('FR-094 đọc trang bình luận/khách theo workspace, không đọc cột liên hệ mã hóa', async () => {
    const ch = await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', 'exp-ch', 'Page') RETURNING id",
      [ws],
    );
    const leads = await db.withJob(ws, (tx) => readLeadsPage(tx, ws, null, 10));
    expect(leads.rows).toEqual([]);
    expect(leads.lastId).toBeNull();
    const comments = await db.withJob(ws, (tx) => readCommentsPage(tx, ws, null, 10));
    expect(comments.rows).toEqual([]);
    expect(ch.rows[0].id).toBeTruthy();
    await admin.query('DELETE FROM cf.channels WHERE workspace_id = $1', [ws]);
  });
});
