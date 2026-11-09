import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  approvePolicyFact,
  deletePolicyFact,
  listAllPolicyFacts,
  listApprovedPolicyFacts,
  refreshPolicySuggestions,
  savePolicyFact,
} from '../src/queries/policy-facts';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode as rejectCodeOf,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * DRAFT-FACT-SLOTS PR 2 — `cf.policy_facts`: RLS (đọc: thành viên; ghi: Owner; hệ thống chỉ đề xuất NHÁP), trigger `policy_facts_guard` (chỉ Owner duyệt, dấu duyệt do server đóng,
 * bất biến workspace/kind/slot/origin, rev tăng), cô lập chéo workspace, bản nháp không bao giờ vào danh sách đã duyệt.
 */
const RLS = '42501';
const CHECK = '23514';
const UNIQUE = '23505';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;

const expectRejectCode = async (promise: Promise<unknown>, code: string) =>
  expect(await rejectCodeOf(promise)).toBe(code);

const nationwide = {
  kind: 'nationwide',
  label: 'Toàn quốc',
  feeMinor: 30000,
  currency: 'VND',
  daysMin: 2,
  daysMax: 4,
  cod: true,
};
const base = (over: Partial<Parameters<typeof savePolicyFact>[1]> = {}) => ({
  workspaceId: ws,
  kind: 'ship_region' as const,
  slot: 'toan quoc',
  data: nationwide,
  status: 'approved' as const,
  origin: 'manual' as const,
  ...over,
});
const row = async (id: string) =>
  (await admin.query('SELECT * FROM cf.policy_facts WHERE id = $1', [id])).rows[0];

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  staff = await seedUser(admin, 'staff');
  otherOwner = await seedUser(admin, 'otherOwner');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('Owner ghi và duyệt', () => {
  it('Owner ghi bản đã duyệt: server đóng dấu approved_by/approved_at, rev = 1', async () => {
    const id = await db.withActor(ws, owner, (tx) =>
      savePolicyFact(tx, base({ slot: 'a-owner-approved', createdBy: owner })),
    );
    const r = await row(id);
    expect(r.status).toBe('approved');
    expect(r.approved_by).toBe(owner);
    expect(r.approved_at).not.toBeNull();
    expect(r.rev).toBe(1);
  });

  it('client KHÔNG tự ghi được approved_by/approved_at/rev (không có trong GRANT)', async () => {
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        tx.execute(sql`
          INSERT INTO cf.policy_facts (workspace_id, kind, slot, data, status, approved_by)
          VALUES (${ws}::uuid, 'cod', 'x-forge', '{"value":true}'::jsonb, 'approved', ${staff}::uuid)`),
      ),
      RLS,
    );
    const id = await db.withActor(ws, owner, (tx) =>
      savePolicyFact(tx, base({ slot: 'rev-forge' })),
    );
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        tx.execute(sql`UPDATE cf.policy_facts SET rev = 99 WHERE id = ${id}::uuid`),
      ),
      RLS,
    );
  });

  it('sửa bản đã duyệt tăng rev; đổi data đóng dấu lại, không đổi data giữ dấu cũ', async () => {
    const id = await db.withActor(ws, owner, (tx) =>
      savePolicyFact(tx, base({ slot: 'rev-bump' })),
    );
    const before = await row(id);
    await db.withActor(ws, owner, (tx) =>
      tx.execute(sql`UPDATE cf.policy_facts SET evidence = 'ghi chú' WHERE id = ${id}::uuid`),
    );
    const afterNote = await row(id);
    expect(afterNote.rev).toBe(2);
    expect(afterNote.approved_at.getTime()).toBe(before.approved_at.getTime());
    await db.withActor(ws, owner, (tx) =>
      savePolicyFact(tx, base({ slot: 'rev-bump', data: { ...nationwide, feeMinor: 35000 } })),
    );
    const afterData = await row(id);
    expect(afterData.rev).toBe(3);
    expect(afterData.data.feeMinor).toBe(35000);
    expect(afterData.approved_at.getTime()).toBeGreaterThanOrEqual(before.approved_at.getTime());
  });

  it('không đổi được workspace/kind/slot/origin (trigger, lớp thứ hai ngoài GRANT)', async () => {
    const id = await db.withActor(ws, owner, (tx) =>
      savePolicyFact(tx, base({ kind: 'cod', slot: 'cod', data: { value: true } })),
    );
    await expectRejectCode(
      admin.query("UPDATE cf.policy_facts SET slot = 'doi-slot' WHERE id = $1", [id]),
      CHECK,
    );
    await expectRejectCode(
      admin.query("UPDATE cf.policy_facts SET origin = 'text_suggested' WHERE id = $1", [id]),
      CHECK,
    );
  });
});

describe('Staff, người ngoài và ngữ cảnh trần', () => {
  it('Staff ĐỌC được nhưng KHÔNG ghi/sửa/xóa', async () => {
    const id = await db.withActor(ws, owner, (tx) =>
      savePolicyFact(tx, base({ slot: 'staff-read' })),
    );
    const seen = await db.withActor(ws, staff, (tx) => listAllPolicyFacts(tx, ws));
    expect(seen.map((r) => r.id)).toContain(id);
    await expectRejectCode(
      db.withActor(ws, staff, (tx) => savePolicyFact(tx, base({ slot: 'staff-write' }))),
      RLS,
    );
    await db.withActor(ws, staff, (tx) =>
      tx.execute(sql`UPDATE cf.policy_facts SET evidence = 'x' WHERE id = ${id}::uuid`),
    );
    expect((await row(id)).evidence).toBeNull(); // RLS lọc hết dòng: không sửa được
    expect(await db.withActor(ws, staff, (tx) => deletePolicyFact(tx, ws, id))).toBe(false);
  });

  it('withWorkspace trần (không người dùng) chỉ đọc; ghi bị từ chối', async () => {
    await expectRejectCode(
      db.withWorkspace(ws, (tx) => savePolicyFact(tx, base({ slot: 'bare-write' }))),
      RLS,
    );
    expect(await db.withWorkspace(ws, (tx) => listAllPolicyFacts(tx, ws))).toBeInstanceOf(Array);
  });

  it('cô lập chéo workspace: Owner ws khác không thấy, không sửa, không xóa; không ghi vào workspace khác', async () => {
    const id = await db.withActor(ws, owner, (tx) =>
      savePolicyFact(tx, base({ slot: 'isolation' })),
    );
    expect(
      (await db.withActor(other, otherOwner, (tx) => listAllPolicyFacts(tx, other))).map(
        (r) => r.id,
      ),
    ).not.toContain(id);
    expect(await db.withActor(other, otherOwner, (tx) => deletePolicyFact(tx, other, id))).toBe(
      false,
    );
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) =>
        savePolicyFact(tx, base({ workspaceId: ws, slot: 'cross-write' })),
      ),
      RLS,
    );
  });
});

describe('Hệ thống (worker) chỉ ĐỀ XUẤT nháp', () => {
  const suggestion = (over: Partial<Parameters<typeof savePolicyFact>[1]> = {}) =>
    base({
      status: 'draft',
      origin: 'shopify_suggested',
      evidence: 'Miễn phí vận chuyển đơn từ 300k',
      slot: 'sys-draft',
      ...over,
    });

  it('ghi được nháp có evidence (origin ≠ manual); làm mới nháp (cùng slot) được', async () => {
    const id = await db.withJob(ws, (tx) => savePolicyFact(tx, suggestion()));
    const again = await db.withJob(ws, (tx) =>
      savePolicyFact(tx, suggestion({ data: { ...nationwide, feeMinor: 40000 } })),
    );
    expect(again).toBe(id);
    const r = await row(id);
    expect(r.status).toBe('draft');
    expect(r.approved_by).toBeNull();
    expect(r.data.feeMinor).toBe(40000);
  });

  it('KHÔNG ghi được bản đã duyệt, không ghi origin manual, không duyệt bản nháp', async () => {
    await expectRejectCode(
      db.withJob(ws, (tx) =>
        savePolicyFact(tx, suggestion({ slot: 'sys-approved', status: 'approved' })),
      ),
      RLS,
    );
    await expectRejectCode(
      db.withJob(ws, (tx) =>
        savePolicyFact(tx, suggestion({ slot: 'sys-manual', origin: 'manual' })),
      ),
      RLS,
    );
    const id = await db.withJob(ws, (tx) =>
      savePolicyFact(tx, suggestion({ slot: 'sys-promote' })),
    );
    await expectRejectCode(
      db.withJob(ws, (tx) =>
        tx.execute(sql`UPDATE cf.policy_facts SET status = 'approved' WHERE id = ${id}::uuid`),
      ),
      RLS,
    );
  });

  it('trigger là lớp thứ hai: ngay cả kết nối bỏ qua RLS, không có Owner thì không duyệt được (42501)', async () => {
    const id = await db.withJob(ws, (tx) =>
      savePolicyFact(tx, suggestion({ slot: 'trigger-guard' })),
    );
    await expectRejectCode(
      admin.query("UPDATE cf.policy_facts SET status = 'approved' WHERE id = $1", [id]),
      RLS,
    );
  });

  it('thiếu evidence khi origin ≠ manual → CHECK', async () => {
    await expectRejectCode(
      db.withJob(ws, (tx) =>
        savePolicyFact(tx, suggestion({ slot: 'no-evidence', evidence: null })),
      ),
      CHECK,
    );
  });

  it('hệ thống xóa được bản NHÁP của mình nhưng không xóa bản đã duyệt', async () => {
    const draftId = await db.withJob(ws, (tx) =>
      savePolicyFact(tx, suggestion({ slot: 'sys-del' })),
    );
    const approvedId = await db.withActor(ws, owner, (tx) =>
      savePolicyFact(tx, base({ slot: 'sys-keep' })),
    );
    expect(await db.withJob(ws, (tx) => deletePolicyFact(tx, ws, draftId))).toBe(true);
    expect(await db.withJob(ws, (tx) => deletePolicyFact(tx, ws, approvedId))).toBe(false);
  });
});

describe('Duyệt đề xuất và danh sách đã duyệt', () => {
  it('bản nháp KHÔNG vào danh sách đã duyệt; Owner duyệt thay bản đã duyệt cũ cùng slot', async () => {
    const approved = await db.withActor(ws, owner, (tx) =>
      savePolicyFact(tx, base({ slot: 'flow', data: { ...nationwide, feeMinor: 30000 } })),
    );
    const draft = await db.withJob(ws, (tx) =>
      savePolicyFact(
        tx,
        base({
          slot: 'flow',
          status: 'draft',
          origin: 'text_suggested',
          evidence: 'Phí ship toàn quốc 25.000đ',
          data: { ...nationwide, feeMinor: 25000 },
        }),
      ),
    );
    const before = await db.withWorkspace(ws, (tx) => listApprovedPolicyFacts(tx, ws));
    expect(before.find((r) => r.slot === 'flow')?.id).toBe(approved);
    expect(before.some((r) => r.id === draft)).toBe(false);

    expect((await row(draft)).rev).toBe(1);
    expect(await db.withActor(ws, owner, (tx) => approvePolicyFact(tx, ws, draft, 1))).toBe(
      'approved',
    );
    const after = await db.withWorkspace(ws, (tx) => listApprovedPolicyFacts(tx, ws));
    const flow = after.filter((r) => r.slot === 'flow');
    expect(flow).toHaveLength(1);
    expect(flow[0]?.id).toBe(approved); // giữ nguyên id bản đã duyệt
    expect((flow[0] as { data: { feeMinor: number } }).data.feeMinor).toBe(25000);
    expect((await row(approved)).approved_by).toBe(owner);
    expect(await db.withActor(ws, owner, (tx) => approvePolicyFact(tx, ws, draft, 1))).toBe(
      'not_found',
    );
  });

  it('duyệt LẦN ĐẦU (chưa có bản đã duyệt cùng slot): thăng cấp nháp, đóng dấu người duyệt', async () => {
    const draft = await db.withJob(ws, (tx) =>
      savePolicyFact(
        tx,
        base({ slot: 'first-approve', status: 'draft', origin: 'text_suggested', evidence: 'e' }),
      ),
    );
    expect(await db.withActor(ws, owner, (tx) => approvePolicyFact(tx, ws, draft, 1))).toBe(
      'approved',
    );
    const r = await row(draft);
    expect(r.status).toBe('approved');
    expect(r.approved_by).toBe(owner);
  });

  it('duyệt kèm rev: worker làm mới nháp giữa lúc Owner xem → duyệt bị từ chối (stale), nháp giữ nguyên; xem lại rev mới thì duyệt được', async () => {
    const mk = (feeMinor: number) =>
      db.withJob(ws, (tx) =>
        savePolicyFact(
          tx,
          base({
            slot: 'stale-rev',
            status: 'draft',
            origin: 'shopify_suggested',
            evidence: 'e',
            data: { ...nationwide, feeMinor },
          }),
        ),
      );
    const draft = await mk(25000);
    const seenRev = (await row(draft)).rev; // Owner đang xem rev này
    await mk(99000); // worker làm mới nháp → rev tăng
    expect(await db.withActor(ws, owner, (tx) => approvePolicyFact(tx, ws, draft, seenRev))).toBe(
      'stale',
    );
    const after = await row(draft);
    expect(after.status).toBe('draft');
    expect(after.data.feeMinor).toBe(99000);
    expect(await db.withActor(ws, owner, (tx) => approvePolicyFact(tx, ws, draft, after.rev))).toBe(
      'approved',
    );
    expect((await row(draft)).data.feeMinor).toBe(99000);
  });

  it('duyệt thay thế khi đã có bản đã duyệt cùng slot: một giao dịch, không lỗi unique, chỉ còn một bản đã duyệt', async () => {
    const old = await db.withActor(ws, owner, (tx) =>
      savePolicyFact(tx, base({ slot: 'replace', data: { ...nationwide, feeMinor: 30000 } })),
    );
    const draft = await db.withJob(ws, (tx) =>
      savePolicyFact(
        tx,
        base({
          slot: 'replace',
          status: 'draft',
          origin: 'text_suggested',
          evidence: 'e',
          data: { ...nationwide, feeMinor: 20000 },
        }),
      ),
    );
    const rev = (await row(draft)).rev;
    expect(await db.withActor(ws, owner, (tx) => approvePolicyFact(tx, ws, draft, rev))).toBe(
      'approved',
    );
    const approvedRows = (
      await db.withWorkspace(ws, (tx) => listApprovedPolicyFacts(tx, ws))
    ).filter((r) => r.slot === 'replace');
    expect(approvedRows).toHaveLength(1);
    expect((approvedRows[0] as { data: { feeMinor: number } }).data.feeMinor).toBe(20000);
    expect((approvedRows[0] as { id: string }).id).toBe(old); // id bản đã duyệt GIỮ NGUYÊN
    expect((await row(old)).rev).toBe(2);
    expect((await row(old)).approved_by).toBe(owner);
    expect(
      (await db.withWorkspace(ws, (tx) => listAllPolicyFacts(tx, ws))).some((r) => r.id === draft),
    ).toBe(false);
  });

  it('Staff không duyệt được (RLS), người lạ không duyệt bản của workspace khác', async () => {
    const draft = await db.withJob(ws, (tx) =>
      savePolicyFact(
        tx,
        base({ slot: 'staff-approve', status: 'draft', origin: 'text_suggested', evidence: 'e' }),
      ),
    );
    expect(await db.withActor(ws, staff, (tx) => approvePolicyFact(tx, ws, draft, 1))).toBe(
      'not_found',
    );
    expect(
      await db.withActor(other, otherOwner, (tx) => approvePolicyFact(tx, other, draft, 1)),
    ).toBe('not_found');
    expect((await row(draft)).status).toBe('draft');
  });

  it('một slot tối đa MỘT bản đã duyệt và MỘT nháp (unique); data sai cấu trúc không ghi được', async () => {
    const insertDraft = () =>
      admin.query(
        `INSERT INTO cf.policy_facts (workspace_id, kind, slot, data) VALUES ($1, 'ship_region', 'uniq', '{}'::jsonb)`,
        [ws],
      );
    await insertDraft();
    await expectRejectCode(insertDraft(), UNIQUE);
    await expect(
      db.withActor(ws, owner, (tx) =>
        savePolicyFact(tx, base({ slot: 'bad-data', data: { kind: 'city', label: 'Nội thành' } })),
      ),
    ).rejects.toThrow(/không hợp lệ/);
    await expectRejectCode(
      admin.query(
        `INSERT INTO cf.policy_facts (workspace_id, kind, slot, data) VALUES ($1, 'cod', 'arr', '[1]'::jsonb)`,
        [ws],
      ),
      CHECK,
    );
  });
});

describe('refreshPolicySuggestions — hệ thống làm mới đề xuất', () => {
  let rws: string;
  let rowner: string;
  beforeAll(async () => {
    rws = await seedWorkspace(admin);
    rowner = await seedUser(admin, 'rowner');
    await seedMember(admin, rws, rowner, 'owner');
  });
  const sug = (slot: string, feeMinor: number) => ({
    kind: 'ship_region' as const,
    slot,
    data: { ...nationwide, feeMinor },
    evidence: `Phí ship ${feeMinor}`,
  });
  const run = (
    suggestions: ReturnType<typeof sug>[],
    origin: 'shopify_suggested' | 'text_suggested' = 'shopify_suggested',
  ) =>
    db.withJob(rws, (tx) =>
      refreshPolicySuggestions(tx, rws, origin, suggestions, 'shopify:policies'),
    );
  const draftOf = async (slot: string) =>
    (await db.withWorkspace(rws, (tx) => listAllPolicyFacts(tx, rws))).find(
      (r) => r.slot === slot && r.status === 'draft',
    );

  it('tạo nháp; đồng bộ lại cùng nội dung KHÔNG tăng rev; đổi nội dung thì tăng; không còn được đề xuất thì xóa', async () => {
    expect(await run([sug('rf-a', 30000)])).toEqual({ drafted: 1, removed: 0 });
    const first = await draftOf('rf-a');
    expect(first?.rev).toBe(1);
    await run([sug('rf-a', 30000)]);
    expect((await draftOf('rf-a'))?.rev).toBe(1);
    await run([sug('rf-a', 35000)]);
    expect((await draftOf('rf-a'))?.rev).toBe(2);
    expect(await run([])).toEqual({ drafted: 0, removed: 1 });
    expect(await draftOf('rf-a')).toBeUndefined();
  });

  it('trùng hệt bản ĐÃ DUYỆT → không tạo nháp; không bao giờ đụng bản đã duyệt hay nháp của nguồn khác', async () => {
    await db.withActor(rws, rowner, (tx) =>
      savePolicyFact(
        tx,
        base({ workspaceId: rws, slot: 'rf-b', data: { ...nationwide, feeMinor: 30000 } }),
      ),
    );
    expect(await run([sug('rf-b', 30000)])).toEqual({ drafted: 0, removed: 0 });
    expect(await draftOf('rf-b')).toBeUndefined();
    await run([sug('rf-c', 20000)], 'text_suggested');
    await run([]); // làm mới nguồn shopify (rỗng) không xóa nháp text_suggested
    expect(await draftOf('rf-c')).toBeDefined();
    const approved = await db.withWorkspace(rws, (tx) => listApprovedPolicyFacts(tx, rws));
    expect(approved.some((r) => r.slot === 'rf-b')).toBe(true);
  });

  it('đề xuất sai cấu trúc bị bỏ (không ghi, không làm hỏng lượt)', async () => {
    const bad = {
      kind: 'ship_region' as const,
      slot: 'rf-bad',
      data: { kind: 'city' },
      evidence: 'x',
    };
    expect(await run([bad as never])).toEqual({ drafted: 0, removed: 0 });
  });
});
