import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  cancelWorkspaceDeletion,
  confirmWorkspaceDeletion,
  executeWorkspaceDeletion,
  getLatestDeletionRequest,
  listDueWorkspaceDeletions,
  requestWorkspaceDeletion,
} from '../src/workspace-deletion';
import {
  createAdminPool,
  createWebDb,
  createWorkerDb,
  expectRejectCode,
  seedAiUsage,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * WORKSPACE-DELETE (migration 0055, FR-094, US-071, Q-WSD1): xóa workspace 2 bước, chỉ Owner, có thời gian chờ; job xóa
 * của `cf_worker`; dòng yêu cầu còn lại sau khi xóa làm nhật ký tối thiểu. Mọi lần ghi qua hàm DEFINER.
 */
let admin: pg.Pool;
let web: FlowDb;
let worker: FlowDb;
let wsA: string;
let wsB: string;
let ownerA: string;
let ownerA2: string;
let staffA: string;
let ownerB: string;
let slugA: string;

const DAY = 24 * 3600 * 1000;

const rowsOf = async (text: string, params: unknown[]) => (await admin.query(text, params)).rows;
const requestRow = async (id: string) =>
  (await rowsOf('SELECT * FROM core.workspace_deletion_requests WHERE id = $1', [id]))[0] as {
    status: string;
    execute_after: Date | null;
    completed_at: Date | null;
    deleted_members: number | null;
    cancelled_by: string | null;
  };
const reset = async (ws: string) => {
  await admin.query(
    `UPDATE core.workspace_deletion_requests SET status = 'cancelled', cancelled_at = now() WHERE workspace_id = $1 AND status IN ('awaiting_confirm','scheduled')`,
    [ws],
  );
};

beforeAll(async () => {
  admin = createAdminPool();
  web = createWebDb();
  worker = createWorkerDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  ownerA = await seedUser(admin);
  ownerA2 = await seedUser(admin);
  staffA = await seedUser(admin);
  ownerB = await seedUser(admin);
  await seedMember(admin, wsA, ownerA, 'owner');
  await seedMember(admin, wsA, ownerA2, 'owner');
  await seedMember(admin, wsA, staffA, 'staff');
  await seedMember(admin, wsB, ownerB, 'owner');
  slugA = (await rowsOf('SELECT slug FROM core.workspaces WHERE id = $1', [wsA]))[0].slug;
});
afterAll(async () => {
  await Promise.all([web.close(), worker.close(), admin.end()]);
});

describe('FR-094 quyền ghi của bảng yêu cầu xóa', () => {
  it('cf_app KHÔNG ghi trực tiếp được (INSERT/UPDATE/DELETE → 42501), kể cả là Owner', async () => {
    const run = (query: string) =>
      expectRejectCode(
        web.withActor(wsA, ownerA, async (tx) => {
          await tx.execute(sql.raw(query));
        }),
      );
    expect(
      await run(
        `INSERT INTO core.workspace_deletion_requests (workspace_id, requested_by, confirm_expires_at) VALUES ('${wsA}', '${ownerA}', now())`,
      ),
    ).toBe('42501');
    expect(await run(`UPDATE core.workspace_deletion_requests SET status = 'completed'`)).toBe(
      '42501',
    );
    expect(await run(`DELETE FROM core.workspace_deletion_requests`)).toBe('42501');
    expect(await run(`DELETE FROM core.workspaces WHERE id = '${wsA}'`)).toBe('42501');
  });
});

describe('FR-094 bước 1: chỉ Owner yêu cầu xóa', () => {
  it('Staff, người ngoài workspace, và ngữ cảnh không người dùng → 42501', async () => {
    expect(
      await expectRejectCode(web.withActor(wsA, staffA, (tx) => requestWorkspaceDeletion(tx, wsA))),
    ).toBe('42501');
    expect(
      await expectRejectCode(web.withActor(wsA, ownerB, (tx) => requestWorkspaceDeletion(tx, wsA))),
    ).toBe('42501');
    expect(
      await expectRejectCode(web.withWorkspace(wsA, (tx) => requestWorkspaceDeletion(tx, wsA))),
    ).toBe('42501');
    expect(
      await rowsOf('SELECT 1 FROM core.workspace_deletion_requests WHERE workspace_id = $1', [wsA]),
    ).toHaveLength(0);
  });

  it('chéo workspace: Owner của B (ngữ cảnh B) không yêu cầu xóa A được (tham số ≠ ngữ cảnh → 42501)', async () => {
    expect(
      await expectRejectCode(web.withActor(wsB, ownerB, (tx) => requestWorkspaceDeletion(tx, wsA))),
    ).toBe('42501');
    expect(
      await expectRejectCode(web.withActor(wsB, ownerB, (tx) => cancelWorkspaceDeletion(tx, wsA))),
    ).toBe('42501');
  });

  it('Owner tạo yêu cầu chờ xác nhận (15 phút); gọi lại trả chính yêu cầu đó', async () => {
    const first = await web.withActor(wsA, ownerA, (tx) => requestWorkspaceDeletion(tx, wsA));
    const again = await web.withActor(wsA, ownerA, (tx) => requestWorkspaceDeletion(tx, wsA));
    expect(again.requestId).toBe(first.requestId);
    const ms = first.confirmExpiresAt.getTime() - Date.now();
    // Dung sai ±1 phút: đồng hồ máy DB (máy ảo) và máy chạy test lệch nhau chút ít.
    expect(ms).toBeGreaterThan(14 * 60_000 - 60_000);
    expect(ms).toBeLessThanOrEqual(15 * 60_000 + 60_000);
    expect((await requestRow(first.requestId)).status).toBe('awaiting_confirm');
    const logs = await rowsOf(
      `SELECT actor_id FROM core.action_logs WHERE workspace_id = $1 AND action = 'workspace.deletion_requested'`,
      [wsA],
    );
    expect(logs).toEqual([{ actor_id: ownerA }]);
    await reset(wsA);
  });
});

describe('FR-094 RLS đọc yêu cầu xóa', () => {
  it('Owner đọc được; Staff, workspace khác và ngữ cảnh trần thì không', async () => {
    const { requestId } = await web.withActor(wsA, ownerA, (tx) =>
      requestWorkspaceDeletion(tx, wsA),
    );
    const asOwner = await web.withActor(wsA, ownerA2, (tx) => getLatestDeletionRequest(tx, wsA));
    expect(asOwner?.id).toBe(requestId);
    expect(asOwner?.requestedBy).toBe(ownerA);
    expect(await web.withActor(wsA, staffA, (tx) => getLatestDeletionRequest(tx, wsA))).toBeNull();
    expect(await web.withActor(wsB, ownerB, (tx) => getLatestDeletionRequest(tx, wsA))).toBeNull();
    expect(await web.withWorkspace(wsA, (tx) => getLatestDeletionRequest(tx, wsA))).toBeNull();
    await reset(wsA);
  });
});

describe('FR-094 bước 2: gõ lại mã workspace', () => {
  it('sai mã → mismatch, không đổi gì; đúng mã (bỏ khoảng trắng) → lên lịch sau 7 ngày + ghi nhật ký', async () => {
    const { requestId } = await web.withActor(wsA, ownerA, (tx) =>
      requestWorkspaceDeletion(tx, wsA),
    );
    const bad = await web.withActor(wsA, ownerA, (tx) =>
      confirmWorkspaceDeletion(tx, wsA, { requestId, typedSlug: 'sai-ma' }),
    );
    expect(bad).toEqual({ result: 'mismatch', executeAfter: null });
    expect((await requestRow(requestId)).status).toBe('awaiting_confirm');

    const ok = await web.withActor(wsA, ownerA, (tx) =>
      confirmWorkspaceDeletion(tx, wsA, { requestId, typedSlug: ` ${slugA} ` }),
    );
    expect(ok.result).toBe('ok');
    const ms = (ok.executeAfter?.getTime() ?? 0) - Date.now();
    expect(ms).toBeGreaterThan(7 * DAY - 60_000);
    expect(ms).toBeLessThanOrEqual(7 * DAY + 60_000);
    expect((await requestRow(requestId)).status).toBe('scheduled');
    const logs = await rowsOf(
      `SELECT 1 FROM core.action_logs WHERE workspace_id = $1 AND action = 'workspace.deletion_scheduled'`,
      [wsA],
    );
    expect(logs).toHaveLength(1);
  });

  it('đã lên lịch: yêu cầu mới → CF409; xác nhận lại → CF409', async () => {
    const id =
      (await web.withActor(wsA, ownerA, (tx) => getLatestDeletionRequest(tx, wsA)))?.id ?? '';
    expect(id).not.toBe('');
    expect(
      await expectRejectCode(web.withActor(wsA, ownerA, (tx) => requestWorkspaceDeletion(tx, wsA))),
    ).toBe('CF409');
    expect(
      await expectRejectCode(
        web.withActor(wsA, ownerA, (tx) =>
          confirmWorkspaceDeletion(tx, wsA, { requestId: id, typedSlug: slugA }),
        ),
      ),
    ).toBe('CF409');
  });

  it('một Owner khác hủy được; sau hủy có thể yêu cầu lại; cancel khi không có gì → false', async () => {
    const id =
      (await web.withActor(wsA, ownerA, (tx) => getLatestDeletionRequest(tx, wsA)))?.id ?? '';
    expect(id).not.toBe('');
    expect(await web.withActor(wsA, ownerA2, (tx) => cancelWorkspaceDeletion(tx, wsA))).toBe(true);
    const row = await requestRow(id);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_by).toBe(ownerA2);
    expect(await web.withActor(wsA, ownerA2, (tx) => cancelWorkspaceDeletion(tx, wsA))).toBe(false);
    expect(
      await expectRejectCode(web.withActor(wsA, staffA, (tx) => cancelWorkspaceDeletion(tx, wsA))),
    ).toBe('42501');
    const fresh = await web.withActor(wsA, ownerA, (tx) => requestWorkspaceDeletion(tx, wsA));
    expect(fresh.requestId).not.toBe(id);
    await reset(wsA);
  });

  it('chỉ chính người làm bước 1 xác nhận được (Owner khác → not_requester)', async () => {
    const { requestId } = await web.withActor(wsA, ownerA, (tx) =>
      requestWorkspaceDeletion(tx, wsA),
    );
    const other = await web.withActor(wsA, ownerA2, (tx) =>
      confirmWorkspaceDeletion(tx, wsA, { requestId, typedSlug: slugA }),
    );
    expect(other.result).toBe('not_requester');
    expect((await requestRow(requestId)).status).toBe('awaiting_confirm');
    await reset(wsA);
  });

  it('quá 15 phút → expired (không lên lịch); yêu cầu mới tạo được dòng mới', async () => {
    const { requestId } = await web.withActor(wsA, ownerA, (tx) =>
      requestWorkspaceDeletion(tx, wsA),
    );
    await admin.query(
      `UPDATE core.workspace_deletion_requests SET confirm_expires_at = now() - interval '1 second' WHERE id = $1`,
      [requestId],
    );
    const late = await web.withActor(wsA, ownerA, (tx) =>
      confirmWorkspaceDeletion(tx, wsA, { requestId, typedSlug: slugA }),
    );
    expect(late.result).toBe('expired');
    expect((await requestRow(requestId)).status).toBe('expired');
    const fresh = await web.withActor(wsA, ownerA, (tx) => requestWorkspaceDeletion(tx, wsA));
    expect(fresh.requestId).not.toBe(requestId);
    await reset(wsA);
  });

  it('chéo workspace: Owner B dùng request id của A → CF404 (không lộ tồn tại); id không có → CF404', async () => {
    const { requestId } = await web.withActor(wsA, ownerA, (tx) =>
      requestWorkspaceDeletion(tx, wsA),
    );
    const slugB = (await rowsOf('SELECT slug FROM core.workspaces WHERE id = $1', [wsB]))[0].slug;
    expect(
      await expectRejectCode(
        web.withActor(wsB, ownerB, (tx) =>
          confirmWorkspaceDeletion(tx, wsB, { requestId, typedSlug: slugB }),
        ),
      ),
    ).toBe('CF404');
    expect(
      await expectRejectCode(
        web.withActor(wsA, ownerA, (tx) =>
          confirmWorkspaceDeletion(tx, wsA, {
            requestId: '00000000-0000-4000-8000-000000000000',
            typedSlug: slugA,
          }),
        ),
      ),
    ).toBe('CF404');
    expect((await requestRow(requestId)).status).toBe('awaiting_confirm');
    await reset(wsA);
  });
});

describe('FR-094 job xóa của worker', () => {
  let wsC: string;
  let wsD: string;
  let ownerC: string;
  let ownerD: string;
  let reqC: string;
  let reqD: string;

  const schedule = async (ws: string, owner: string): Promise<string> => {
    const slug = (await rowsOf('SELECT slug FROM core.workspaces WHERE id = $1', [ws]))[0].slug;
    const { requestId } = await web.withActor(ws, owner, (tx) => requestWorkspaceDeletion(tx, ws));
    await web.withActor(ws, owner, (tx) =>
      confirmWorkspaceDeletion(tx, ws, { requestId, typedSlug: slug }),
    );
    return requestId;
  };

  beforeAll(async () => {
    wsC = await seedWorkspace(admin);
    wsD = await seedWorkspace(admin);
    ownerC = await seedUser(admin);
    ownerD = await seedUser(admin);
    await seedMember(admin, wsC, ownerC, 'owner');
    await seedMember(admin, wsD, ownerD, 'owner');
    await seedAiUsage(admin, wsC);
    await seedAiUsage(admin, wsD);
    // FK ghép NO ACTION (leads→channels, kb_gaps→products/kb_sources): xóa cascade không được kẹt vì thứ tự xóa.
    const channelId = (
      await rowsOf(
        `INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page thử') RETURNING id`,
        [wsD, `page-${wsD}`],
      )
    )[0].id;
    await admin.query(
      `INSERT INTO cf.leads (workspace_id, channel_id, source_type, phone_enc, phone_hash, phone_last4, key_version)
       VALUES ($1, $2, 'comment', '\\x00', decode(repeat('00', 32), 'hex'), '1234', 1)`,
      [wsD, channelId],
    );
    const productId = (
      await rowsOf(
        `INSERT INTO cf.products (workspace_id, name) VALUES ($1, 'SP thử') RETURNING id`,
        [wsD],
      )
    )[0].id;
    await admin.query(
      `INSERT INTO cf.kb_gaps (workspace_id, topic, sample_question_masked, product_id) VALUES ($1, 'shipping', 'ship bao lâu?', $2)`,
      [wsD, productId],
    );
    reqC = await schedule(wsC, ownerC);
    reqD = await schedule(wsD, ownerD);
  });

  it('web (cf_app) không gọi được hàm của worker (liệt kê/xóa) → 42501', async () => {
    expect(await expectRejectCode(web.withSystem((tx) => listDueWorkspaceDeletions(tx, 10)))).toBe(
      '42501',
    );
    expect(
      await expectRejectCode(web.withJob(wsC, (tx) => executeWorkspaceDeletion(tx, wsC, reqC))),
    ).toBe('42501');
    expect(
      await expectRejectCode(
        web.withActor(wsC, ownerC, (tx) => executeWorkspaceDeletion(tx, wsC, reqC)),
      ),
    ).toBe('42501');
  });

  it('chưa tới hạn: không liệt kê, execute → not_due, dữ liệu còn nguyên', async () => {
    const due = await worker.withSystem((tx) => listDueWorkspaceDeletions(tx, 50));
    expect(due.map((d) => d.requestId)).not.toContain(reqC);
    expect(await worker.withJob(wsC, (tx) => executeWorkspaceDeletion(tx, wsC, reqC))).toBe(
      'not_due',
    );
    expect(await rowsOf('SELECT 1 FROM core.workspaces WHERE id = $1', [wsC])).toHaveLength(1);
  });

  it('execute sai workspace ngữ cảnh (ws D, request của C) → 42501; request của workspace khác → not_scheduled', async () => {
    expect(
      await expectRejectCode(worker.withJob(wsD, (tx) => executeWorkspaceDeletion(tx, wsC, reqC))),
    ).toBe('42501');
    await admin.query(
      `UPDATE core.workspace_deletion_requests SET execute_after = now() - interval '1 second' WHERE id = $1`,
      [reqC],
    );
    expect(await worker.withJob(wsD, (tx) => executeWorkspaceDeletion(tx, wsD, reqC))).toBe(
      'not_scheduled',
    );
    expect(await rowsOf('SELECT 1 FROM core.workspaces WHERE id = $1', [wsC])).toHaveLength(1);
  });

  it('đã hủy giữa chừng: dù quá hạn cũng KHÔNG xóa', async () => {
    expect(await web.withActor(wsC, ownerC, (tx) => cancelWorkspaceDeletion(tx, wsC))).toBe(true);
    const due = await worker.withSystem((tx) => listDueWorkspaceDeletions(tx, 50));
    expect(due.map((d) => d.requestId)).not.toContain(reqC);
    expect(await worker.withJob(wsC, (tx) => executeWorkspaceDeletion(tx, wsC, reqC))).toBe(
      'not_scheduled',
    );
    expect(await rowsOf('SELECT 1 FROM core.workspaces WHERE id = $1', [wsC])).toHaveLength(1);
  });

  it('tới hạn: liệt kê → xóa workspace + dữ liệu (cascade), giữ dòng nhật ký tối thiểu, không đụng workspace khác', async () => {
    await admin.query(
      `UPDATE core.workspace_deletion_requests SET execute_after = now() - interval '1 second' WHERE id = $1`,
      [reqD],
    );
    const due = await worker.withSystem((tx) => listDueWorkspaceDeletions(tx, 50));
    expect(due).toContainEqual({ workspaceId: wsD, requestId: reqD });
    expect(await worker.withJob(wsD, (tx) => executeWorkspaceDeletion(tx, wsD, reqD))).toBe(
      'deleted',
    );
    for (const table of ['core.workspaces', 'core.members', 'cf.ai_usage', 'core.action_logs']) {
      const col = table === 'core.workspaces' ? 'id' : 'workspace_id';
      expect(await rowsOf(`SELECT 1 FROM ${table} WHERE ${col} = $1`, [wsD])).toHaveLength(0);
    }
    // Không còn dòng mồ côi ở BẤT KỲ bảng nào có cột workspace_id (trừ nhật ký tối thiểu).
    const tables = await rowsOf(
      `SELECT table_schema AS s, table_name AS t FROM information_schema.columns c
        WHERE column_name = 'workspace_id' AND table_schema IN ('core','cf')
          AND table_name <> 'workspace_deletion_requests'
          AND EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = c.table_schema
                       AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE')`,
      [],
    );
    expect(tables.length).toBeGreaterThan(20);
    for (const { s, t } of tables) {
      const left = await rowsOf(`SELECT 1 FROM "${s}"."${t}" WHERE workspace_id = $1 LIMIT 1`, [
        wsD,
      ]);
      expect(left, `${s}.${t}`).toHaveLength(0);
    }
    const log = await requestRow(reqD);
    expect(log.status).toBe('completed');
    expect(log.completed_at).not.toBeNull();
    expect(log.deleted_members).toBe(1);
    // workspace khác còn nguyên
    expect(await rowsOf('SELECT 1 FROM core.workspaces WHERE id = $1', [wsC])).toHaveLength(1);
    expect(await rowsOf('SELECT 1 FROM cf.ai_usage WHERE workspace_id = $1', [wsC])).toHaveLength(
      1,
    );
    expect(await rowsOf('SELECT 1 FROM core.workspaces WHERE id = $1', [wsA])).toHaveLength(1);
    // chạy lại idempotent
    expect(await worker.withJob(wsD, (tx) => executeWorkspaceDeletion(tx, wsD, reqD))).toBe(
      'not_scheduled',
    );
  });
});
