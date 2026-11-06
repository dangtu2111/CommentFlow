import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { createLeadContactSink, persistLeadsWith } from '../src/lead-sink';
import { createLeadVault, parseLeadHashKey, parseLeadKeys } from '../src/lead-vault';
import {
  countLeadsByStage,
  deleteLead,
  getLeadCipher,
  listLeads,
  type PreparedLead,
  recordLeads,
  updateLead,
} from '../src/queries/leads';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode as rejectCodeOf,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * LEADS-STORE (FR-082, FR-033, Q-LDS1): INSERT chỉ hệ thống; thành viên đổi stage/ghi chú/giao người; Owner/hệ thống
 * xóa; DB không giữ SĐT/email thô; chống trùng theo băm; giao người chỉ cho thành viên đang hoạt động.
 * Số/email trong test là CHUỖI GIẢ do test tự sinh (không phải dữ liệu khách).
 */
const RLS = '42501';
const CHECK = '23514';
const FK = '23503';

const vault = createLeadVault({
  encKeys: parseLeadKeys(`v1:${'a'.repeat(64)}`),
  hashKey: parseLeadHashKey('c'.repeat(64)),
});

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let removed: string;
let otherOwner: string;
let stranger: string;
let channel: string;
let otherChannel: string;

const expectRejectCode = async (promise: Promise<unknown>, code: string) =>
  expect(await rejectCodeOf(promise)).toBe(code);

const fakePhone = (): string => `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

async function seedChannel(workspace: string): Promise<string> {
  const r = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
    [workspace, `lds-${randomUUID()}`],
  );
  return r.rows[0].id as string;
}

function prepared(
  workspace: string,
  channelId: string,
  phone = fakePhone(),
  email?: string,
): PreparedLead {
  const id = randomUUID();
  return {
    id,
    channelId,
    sourceType: 'comment',
    sourceId: null,
    phone: {
      enc: vault.encrypt(phone, { workspaceId: workspace, leadId: id, field: 'phone' }).ciphertext,
      hash: vault.blindIndex(workspace, 'phone', phone),
      last4: phone.slice(-4),
    },
    email: email
      ? {
          enc: vault.encrypt(email, { workspaceId: workspace, leadId: id, field: 'email' })
            .ciphertext,
          hash: vault.blindIndex(workspace, 'email', email),
        }
      : null,
    keyVersion: 1,
  };
}

const record = (workspace: string, rows: PreparedLead[]) =>
  db.withJob(workspace, (tx) => recordLeads(tx, workspace, rows));

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'ldOwner');
  staff = await seedUser(admin, 'ldStaff');
  removed = await seedUser(admin, 'ldRemoved');
  otherOwner = await seedUser(admin, 'ldOtherOwner');
  stranger = await seedUser(admin, 'ldStranger');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, ws, removed, 'staff');
  await admin.query(
    "UPDATE core.members SET status = 'removed' WHERE workspace_id = $1 AND user_id = $2",
    [ws, removed],
  );
  await seedMember(admin, other, otherOwner, 'owner');
  channel = await seedChannel(ws);
  otherChannel = await seedChannel(other);
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-082 ghi khách tiềm năng (hệ thống)', () => {
  it('withJob ghi được; DB không chứa SĐT/email thô; đọc lại đúng và giải mã khứ hồi', async () => {
    const phone = fakePhone();
    const email = `khach-${randomUUID().slice(0, 8)}@example.invalid`;
    const lead = prepared(ws, channel, phone, email);
    const [res] = await record(ws, [lead]);
    expect(res).toEqual({ id: lead.id, created: true });

    const dump = await admin.query(
      'SELECT row_to_json(l)::text AS t FROM cf.leads l WHERE id = $1',
      [lead.id],
    );
    expect(dump.rows[0].t).not.toContain(phone);
    expect(dump.rows[0].t).not.toContain(email);

    const rows = await db.withActor(ws, staff, (tx) => listLeads(tx, ws));
    expect(rows.find((r) => r.id === lead.id)).toMatchObject({
      phoneLast4: phone.slice(-4),
      hasEmail: true,
      stage: 'new',
      sourceType: 'comment',
      name: null,
      assignedTo: null,
    });
    const cipher = await db.withActor(ws, staff, (tx) => getLeadCipher(tx, ws, lead.id));
    expect(cipher?.keyVersion).toBe(1);
    expect(
      vault.decrypt(cipher?.phoneEnc as Buffer, 1, {
        workspaceId: ws,
        leadId: lead.id,
        field: 'phone',
      }),
    ).toBe(phone);
  });

  it('chống trùng: cùng băm SĐT (hoặc email) → không tạo mới, chạm updated_at', async () => {
    const phone = fakePhone();
    const first = prepared(ws, channel, phone);
    await record(ws, [first]);
    const again = prepared(ws, channel, phone);
    const [res] = await record(ws, [again]);
    expect(res).toEqual({ id: first.id, created: false });
    const n = await admin.query(
      'SELECT count(*)::int AS n FROM cf.leads WHERE workspace_id = $1 AND id = ANY($2)',
      [ws, [first.id, again.id]],
    );
    expect(n.rows[0].n).toBe(1);
    // email trùng nhưng SĐT khác
    const email = `e-${randomUUID().slice(0, 8)}@example.invalid`;
    const a = prepared(ws, channel, fakePhone(), email);
    await record(ws, [a]);
    const [b] = await record(ws, [prepared(ws, channel, fakePhone(), email)]);
    expect(b).toEqual({ id: a.id, created: false });
  });

  it('cùng SĐT ở workspace khác là lead riêng (băm theo workspace)', async () => {
    const phone = fakePhone();
    const a = prepared(ws, channel, phone);
    const b = prepared(other, otherChannel, phone);
    await record(ws, [a]);
    const [res] = await record(other, [b]);
    expect(res?.created).toBe(true);
    expect(a.phone?.hash.equals(b.phone?.hash as Buffer)).toBe(false);
  });

  it('hai lần ghi đồng thời cùng số chỉ tạo một lead', async () => {
    const phone = fakePhone();
    const results = await Promise.all([
      record(ws, [prepared(ws, channel, phone)]),
      record(ws, [prepared(ws, channel, phone)]),
    ]);
    expect(results.flat().filter((r) => r.created)).toHaveLength(1);
  });

  it('ContactSink thật ghi qua withJob (cf_worker) đúng mã hóa', async () => {
    const sink = createLeadContactSink({
      vault,
      channelId: channel,
      sourceType: 'message',
      persist: persistLeadsWith((w, fn) => db.withJob(w, fn)),
    });
    const phone = fakePhone();
    await sink.save(ws, { phones: [phone], emails: [] }, {});
    const row = (await db.withWorkspace(ws, (tx) => listLeads(tx, ws, { limit: 100 }))).find(
      (r) => r.phoneLast4 === phone.slice(-4) && r.sourceType === 'message',
    );
    expect(row).toBeDefined();
  });

  it('Owner, Staff và withWorkspace trần KHÔNG chèn được (42501)', async () => {
    await expectRejectCode(
      db.withActor(ws, owner, (tx) => recordLeads(tx, ws, [prepared(ws, channel)])),
      RLS,
    );
    await expectRejectCode(
      db.withActor(ws, staff, (tx) => recordLeads(tx, ws, [prepared(ws, channel)])),
      RLS,
    );
    await expectRejectCode(
      db.withWorkspace(ws, (tx) => recordLeads(tx, ws, [prepared(ws, channel)])),
      RLS,
    );
  });

  it('workspace khác không ghi vào workspace này; kênh của workspace khác bị FK chặn', async () => {
    await expectRejectCode(
      db.withJob(other, (tx) => recordLeads(tx, ws, [prepared(ws, channel)])),
      RLS,
    );
    await expectRejectCode(
      db.withJob(ws, (tx) => recordLeads(tx, ws, [prepared(ws, otherChannel)])),
      FK,
    );
  });
});

describe('FR-082 ràng buộc dữ liệu (CHECK)', () => {
  const insertRaw = (over: Record<string, unknown>) =>
    db.withJob(ws, (tx) => {
      const lead = prepared(ws, channel);
      const v = {
        stage: 'new',
        last4: lead.phone?.last4,
        phoneEnc: lead.phone?.enc,
        phoneHash: lead.phone?.hash,
        emailEnc: null as Buffer | null,
        emailHash: null as Buffer | null,
        source: 'comment',
        ...over,
      };
      return tx.execute(sql`
        INSERT INTO cf.leads (id, workspace_id, channel_id, source_type, phone_enc, phone_hash, phone_last4,
          email_enc, email_hash, key_version)
        VALUES (${randomUUID()}::uuid, ${ws}::uuid, ${channel}::uuid, ${v.source}, ${v.phoneEnc}::bytea,
          ${v.phoneHash}::bytea, ${v.last4}, ${v.emailEnc}::bytea, ${v.emailHash}::bytea, 1)`);
    });

  it('từ chối: loại nguồn lạ, last4 sai, băm sai độ dài, lead không có liên hệ, thiếu băm/bản mã', async () => {
    await expectRejectCode(insertRaw({ source: 'dm' }), CHECK);
    await expectRejectCode(insertRaw({ last4: '12a4' }), CHECK);
    await expectRejectCode(insertRaw({ phoneHash: Buffer.alloc(8) }), CHECK);
    await expectRejectCode(insertRaw({ phoneEnc: null, phoneHash: null, last4: null }), CHECK);
    await expectRejectCode(insertRaw({ phoneHash: null }), CHECK);
    await expectRejectCode(insertRaw({ emailEnc: Buffer.alloc(40) }), CHECK);
  });
});

describe('FR-082 Kanban: đổi giai đoạn, ghi chú, giao người', () => {
  let leadId: string;
  beforeAll(async () => {
    const lead = prepared(ws, channel);
    leadId = lead.id;
    await record(ws, [lead]);
  });

  it('thành viên (Staff) đổi stage/tên/ghi chú; liệt kê lọc theo stage; đếm theo cột đủ 4 cột', async () => {
    expect(
      await db.withActor(ws, staff, (tx) =>
        updateLead(tx, ws, leadId, { stage: 'contacted', name: 'Lan', note: 'gọi lại 5h' }),
      ),
    ).toBe(true);
    const rows = await db.withActor(ws, staff, (tx) => listLeads(tx, ws, { stage: 'contacted' }));
    expect(rows.find((r) => r.id === leadId)).toMatchObject({ name: 'Lan', note: 'gọi lại 5h' });
    const counts = await db.withActor(ws, staff, (tx) => countLeadsByStage(tx, ws));
    expect(Object.keys(counts).sort()).toEqual(['contacted', 'lost', 'new', 'won']);
    expect(counts.contacted).toBeGreaterThanOrEqual(1);
  });

  it('stage lạ bị CHECK chặn (23514); người ngoài/withWorkspace trần không sửa được (0 dòng)', async () => {
    await expectRejectCode(
      db.withActor(ws, owner, (tx) => updateLead(tx, ws, leadId, { stage: 'archived' as 'won' })),
      CHECK,
    );
    expect(
      await db.withActor(ws, stranger, (tx) => updateLead(tx, ws, leadId, { note: 'x' })),
    ).toBe(false);
    expect(await db.withWorkspace(ws, (tx) => updateLead(tx, ws, leadId, { note: 'x' }))).toBe(
      false,
    );
  });

  it('giao cho thành viên đang hoạt động được; người ngoài/đã gỡ/thành viên workspace khác → 23514', async () => {
    expect(
      await db.withActor(ws, staff, (tx) => updateLead(tx, ws, leadId, { assignedTo: staff })),
    ).toBe(true);
    for (const bad of [stranger, removed, otherOwner]) {
      await expectRejectCode(
        db.withActor(ws, staff, (tx) => updateLead(tx, ws, leadId, { assignedTo: bad })),
        CHECK,
      );
    }
    const assigned = await db.withActor(ws, staff, (tx) =>
      listLeads(tx, ws, { assignedTo: staff }),
    );
    expect(assigned.map((r) => r.id)).toContain(leadId);
    expect(
      await db.withActor(ws, staff, (tx) => updateLead(tx, ws, leadId, { assignedTo: null })),
    ).toBe(true);
  });

  it('cột bất biến không sửa được qua cf_app (42501)', async () => {
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        tx.execute(sql`UPDATE cf.leads SET phone_last4 = '0000' WHERE id = ${leadId}::uuid`),
      ),
      RLS,
    );
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        tx.execute(
          sql`UPDATE cf.leads SET workspace_id = ${other}::uuid WHERE id = ${leadId}::uuid`,
        ),
      ),
      RLS,
    );
  });

  it('workspace khác không thấy, không sửa, không xóa', async () => {
    expect(await db.withActor(other, otherOwner, (tx) => listLeads(tx, other))).not.toContainEqual(
      expect.objectContaining({ id: leadId }),
    );
    expect(
      await db.withActor(other, otherOwner, (tx) => getLeadCipher(tx, other, leadId)),
    ).toBeNull();
    expect(
      await db.withActor(other, otherOwner, (tx) => updateLead(tx, other, leadId, { note: 'x' })),
    ).toBe(false);
    expect(await db.withActor(other, otherOwner, (tx) => deleteLead(tx, other, leadId))).toBe(
      false,
    );
  });
});

describe('FR-082 xóa khách tiềm năng', () => {
  it('Staff không xóa được; Owner và hệ thống xóa được', async () => {
    const a = prepared(ws, channel);
    const b = prepared(ws, channel);
    await record(ws, [a, b]);
    expect(await db.withActor(ws, staff, (tx) => deleteLead(tx, ws, a.id))).toBe(false);
    expect(await db.withActor(ws, owner, (tx) => deleteLead(tx, ws, a.id))).toBe(true);
    expect(await db.withJob(ws, (tx) => deleteLead(tx, ws, b.id))).toBe(true);
  });
});

describe('FR-082 phân trang', () => {
  it('giới hạn và con trỏ before (mới nhất trước)', async () => {
    const page1 = await db.withActor(ws, owner, (tx) => listLeads(tx, ws, { limit: 2 }));
    expect(page1).toHaveLength(2);
    const last = page1[1];
    const page2 = await db.withActor(ws, owner, (tx) =>
      listLeads(tx, ws, { limit: 2, before: last?.createdAt }),
    );
    for (const row of page2)
      expect(row.createdAt.getTime()).toBeLessThan(last?.createdAt.getTime() ?? 0);
  });
});
