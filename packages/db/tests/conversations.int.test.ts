import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  assignConversation,
  getConversation,
  listConversations,
  listMessages,
  recordInboundMessage,
  recordOutboundMessage,
  setConversationAi,
  setConversationStatus,
  touchConversationLastMessage,
} from '../src/queries/conversations';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * MSG-STORE (FR-047, Q-MSS1): RLS chéo workspace, chỉ hệ thống tạo hội thoại, nhân viên không sửa mốc cửa sổ,
 * chống trùng mid, lọc cửa sổ 24 giờ/7 ngày, phân trang.
 */
const RLS = '42501';
const CHECK = '23514';
const HOUR = 3_600_000;
const now = new Date('2026-11-06T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;
let stranger: string;
let channel: string;
let otherChannel: string;

async function seedChannel(workspace: string): Promise<string> {
  const r = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
    [workspace, `ms-${randomUUID()}`],
  );
  return r.rows[0].id as string;
}

const inbound = (over: Partial<Parameters<typeof recordInboundMessage>[2]> = {}) => ({
  channelId: channel,
  threadExternalId: `t-${randomUUID()}`,
  customerExternalId: `psid-${randomUUID().slice(0, 8)}`,
  customerName: 'Khách A',
  messageExternalId: `mid-${randomUUID()}`,
  text: 'còn hàng không shop',
  at: ago(HOUR),
  ...over,
});

const ingest = (over: Partial<Parameters<typeof recordInboundMessage>[2]> = {}, w = ws) =>
  db.withJob(w, (tx) => recordInboundMessage(tx, w, inbound(over)));

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  staff = await seedUser(admin, 'staff');
  otherOwner = await seedUser(admin, 'otherOwner');
  stranger = await seedUser(admin, 'stranger');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
  channel = await seedChannel(ws);
  otherChannel = await seedChannel(other);
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-047 ghi tin khách và chống trùng', () => {
  it('tạo hội thoại + tin, đẩy mốc cửa sổ; webhook gửi lại cùng mid không trùng, mốc không lùi', async () => {
    const input = inbound({ at: ago(2 * HOUR) });
    const first = await db.withJob(ws, (tx) => recordInboundMessage(tx, ws, input));
    expect(first.duplicate).toBe(false);
    const again = await db.withJob(ws, (tx) =>
      recordInboundMessage(tx, ws, { ...input, at: ago(10 * HOUR) }),
    );
    expect(again).toMatchObject({ duplicate: true, conversationId: first.conversationId });

    const conv = await db.withActor(ws, owner, (tx) =>
      getConversation(tx, ws, first.conversationId),
    );
    expect(conv?.lastCustomerMsgAt).toEqual(ago(2 * HOUR));
    expect(conv?.status).toBe('open');
    const msgs = await db.withActor(ws, owner, (tx) => listMessages(tx, ws, first.conversationId));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ direction: 'in', sentBy: 'customer', text: input.text });

    const newer = await db.withJob(ws, (tx) =>
      recordInboundMessage(tx, ws, {
        ...input,
        messageExternalId: `mid-${randomUUID()}`,
        at: ago(HOUR),
      }),
    );
    expect(newer.conversationId).toBe(first.conversationId);
    const after = await db.withActor(ws, owner, (tx) =>
      getConversation(tx, ws, first.conversationId),
    );
    expect(after?.lastCustomerMsgAt).toEqual(ago(HOUR));
  });

  it('khách nhắn lại sau khi đã giải quyết → mở lại', async () => {
    const a = await ingest();
    await db.withActor(ws, staff, (tx) =>
      setConversationStatus(tx, ws, a.conversationId, 'resolved'),
    );
    const conv = inbound();
    const first = await ingest({
      ...conv,
      threadExternalId: 'thread-reopen',
      messageExternalId: 'mid-r1',
    });
    await db.withActor(ws, staff, (tx) =>
      setConversationStatus(tx, ws, first.conversationId, 'resolved'),
    );
    await ingest({ ...conv, threadExternalId: 'thread-reopen', messageExternalId: 'mid-r2' });
    const got = await db.withActor(ws, staff, (tx) =>
      getConversation(tx, ws, first.conversationId),
    );
    expect(got?.status).toBe('open');
  });

  it('tin đi: ghi được (nhân viên/AI), trùng mid → null; CHECK hướng↔người gửi, tag chỉ HUMAN_AGENT', async () => {
    const { conversationId } = await ingest();
    const id = await db.withActor(ws, staff, (tx) =>
      recordOutboundMessage(tx, ws, conversationId, {
        text: 'Dạ còn ạ',
        sentBy: 'staff',
        externalId: 'mid-out-1',
        tag: 'HUMAN_AGENT',
      }),
    );
    expect(id).not.toBeNull();
    expect(
      await db.withActor(ws, staff, (tx) =>
        recordOutboundMessage(tx, ws, conversationId, {
          text: 'x',
          sentBy: 'staff',
          externalId: 'mid-out-1',
        }),
      ),
    ).toBeNull();
    expect(
      await expectRejectCode(
        admin.query(
          "INSERT INTO cf.messages (workspace_id, conversation_id, direction, sent_by) VALUES ($1, $2, 'out', 'customer')",
          [ws, conversationId],
        ),
      ),
    ).toBe(CHECK);
    expect(
      await expectRejectCode(
        admin.query(
          "INSERT INTO cf.messages (workspace_id, conversation_id, direction, sent_by, tag) VALUES ($1, $2, 'out', 'staff', 'OTHER')",
          [ws, conversationId],
        ),
      ),
    ).toBe(CHECK);
  });
});

describe('FR-047 RLS và quyền', () => {
  it('workspace khác không thấy/không ghi được; người ngoài không đọc được', async () => {
    const { conversationId } = await ingest();
    expect(
      await db.withActor(other, otherOwner, (tx) => getConversation(tx, other, conversationId)),
    ).toBeNull();
    expect(
      await db.withActor(other, otherOwner, (tx) => listMessages(tx, other, conversationId)),
    ).toEqual([]);
    // withActor(other) nhưng truyền workspaceId thật của ws: RLS vẫn khóa theo workspace hiện tại
    expect(
      await db.withActor(other, otherOwner, (tx) => getConversation(tx, ws, conversationId)),
    ).toBeNull();
    expect(
      await db.withActor(other, otherOwner, (tx) =>
        assignConversation(tx, ws, conversationId, otherOwner),
      ),
    ).toBe(false);
    expect(
      await db.withActor(ws, stranger, (tx) => getConversation(tx, ws, conversationId)),
    ).toBeNull();
    expect(
      await db
        .withActor(ws, stranger, (tx) => listConversations(tx, ws, {}, { now }))
        .then((r) => r.items),
    ).toEqual([]);
  });

  it('hội thoại không gắn chéo kênh của workspace khác (FK ghép)', async () => {
    expect(await expectRejectCode(ingest({ channelId: otherChannel }))).toBe('23503');
  });

  it('chỉ hệ thống tạo hội thoại: nhân viên/Owner/withWorkspace trần bị RLS chặn', async () => {
    const attempt = (
      fn: (tx: Parameters<Parameters<FlowDb['withActor']>[2]>[0]) => Promise<unknown>,
      who: 'owner' | 'staff' | 'bare',
    ) =>
      expectRejectCode(
        who === 'bare'
          ? db.withWorkspace(ws, fn)
          : db.withActor(ws, who === 'owner' ? owner : staff, fn),
      );
    const mk = (tx: Parameters<Parameters<FlowDb['withActor']>[2]>[0]) =>
      recordInboundMessage(tx, ws, inbound());
    expect(await attempt(mk, 'owner')).toBe(RLS);
    expect(await attempt(mk, 'staff')).toBe(RLS);
    expect(await attempt(mk, 'bare')).toBe(RLS);
  });

  it('withWorkspace trần đọc được nhưng không ghi tin nhắn/đổi hội thoại', async () => {
    const { conversationId } = await ingest();
    expect(
      await db.withWorkspace(ws, (tx) => getConversation(tx, ws, conversationId)),
    ).not.toBeNull();
    expect(
      await expectRejectCode(
        db.withWorkspace(ws, (tx) =>
          recordOutboundMessage(tx, ws, conversationId, { text: 'x', sentBy: 'ai' }),
        ),
      ),
    ).toBe(RLS);
    expect(
      await db.withWorkspace(ws, (tx) => setConversationStatus(tx, ws, conversationId, 'resolved')),
    ).toBe(false);
  });

  it('nhân viên không giả tin khách/AI; created_time ép now(); listMessages lấy tin MỚI NHẤT', async () => {
    const { conversationId } = await ingest();
    const raw = (direction: string, sentBy: string) =>
      db.withActor(ws, staff, (tx) =>
        tx.execute(
          sql`INSERT INTO cf.messages (workspace_id, conversation_id, direction, sent_by)
              VALUES (${ws}::uuid, ${conversationId}::uuid, ${direction}, ${sentBy})`,
        ),
      );
    expect(await expectRejectCode(raw('in', 'customer'))).toBe(RLS);
    expect(await expectRejectCode(raw('out', 'ai'))).toBe(RLS);
    await db.withActor(ws, staff, (tx) =>
      recordOutboundMessage(tx, ws, conversationId, {
        text: 'lùi giờ',
        sentBy: 'staff',
        at: new Date('2020-01-01T00:00:00Z'),
      }),
    );
    const all = await db.withActor(ws, staff, (tx) => listMessages(tx, ws, conversationId));
    expect(all[all.length - 1]?.createdTime.getTime()).toBeGreaterThan(Date.now() - 60_000);
    for (let i = 0; i < 3; i++) {
      await db.withJob(ws, (tx) =>
        recordOutboundMessage(tx, ws, conversationId, { text: `ai-${i}`, sentBy: 'ai' }),
      );
    }
    const last2 = await db.withActor(ws, staff, (tx) => listMessages(tx, ws, conversationId, 2));
    expect(last2.map((m) => m.text)).toEqual(['ai-1', 'ai-2']);
  });

  it('nhân viên không tự đổi mốc cửa sổ / số lượt AI; hệ thống thì được', async () => {
    const { conversationId } = await ingest({ at: ago(30 * HOUR) });
    // cột có GRANT (cho worker) — trigger là rào cho đường người dùng
    expect(
      await expectRejectCode(
        db.withActor(ws, staff, (tx) =>
          tx.execute(
            sql`UPDATE cf.conversations SET last_customer_msg_at = now() WHERE id = ${conversationId}::uuid`,
          ),
        ),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        db.withActor(ws, owner, (tx) =>
          tx.execute(
            sql`UPDATE cf.conversations SET ai_turns = 0, customer_name = 'X' WHERE id = ${conversationId}::uuid`,
          ),
        ),
      ),
    ).toBe(RLS);
    expect(
      await db.withJob(ws, (tx) =>
        touchConversationLastMessage(tx, ws, conversationId, now, { aiTurn: true }),
      ),
    ).toBe(true);
    const got = await db.withActor(ws, staff, (tx) => getConversation(tx, ws, conversationId));
    expect(got?.aiTurns).toBe(1);
    expect(got?.lastMessageAt).toEqual(now);
  });

  it('giao việc: thành viên đang hoạt động được; người ngoài/workspace khác → CHECK; bỏ giao bằng null', async () => {
    const { conversationId } = await ingest();
    expect(
      await db.withActor(ws, staff, (tx) => assignConversation(tx, ws, conversationId, owner)),
    ).toBe(true);
    expect(
      (await db.withActor(ws, staff, (tx) => getConversation(tx, ws, conversationId)))?.assignedTo,
    ).toBe(owner);
    expect(
      await expectRejectCode(
        db.withActor(ws, staff, (tx) => assignConversation(tx, ws, conversationId, stranger)),
      ),
    ).toBe(CHECK);
    expect(
      await expectRejectCode(
        db.withActor(ws, staff, (tx) => assignConversation(tx, ws, conversationId, otherOwner)),
      ),
    ).toBe(CHECK);
    expect(
      await db.withActor(ws, staff, (tx) => assignConversation(tx, ws, conversationId, null)),
    ).toBe(true);
  });

  it('bật/tắt AI theo hội thoại, tắt kèm lý do, bật xóa lý do', async () => {
    const { conversationId } = await ingest();
    await db.withActor(ws, staff, (tx) =>
      setConversationAi(tx, ws, conversationId, false, 'human_takeover'),
    );
    expect(
      await db.withActor(ws, staff, (tx) => getConversation(tx, ws, conversationId)),
    ).toMatchObject({
      aiEnabled: false,
      aiDisabledReason: 'human_takeover',
    });
    await db.withActor(ws, staff, (tx) => setConversationAi(tx, ws, conversationId, true, null));
    expect(
      await db.withActor(ws, staff, (tx) => getConversation(tx, ws, conversationId)),
    ).toMatchObject({
      aiEnabled: true,
      aiDisabledReason: null,
    });
  });
});

describe('FR-047 danh sách và lọc', () => {
  let wsL: string;
  let chL: string;
  let user: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    wsL = await seedWorkspace(admin);
    user = await seedUser(admin, 'lister');
    await seedMember(admin, wsL, user, 'owner');
    chL = await seedChannel(wsL);
    const mk = async (key: string, name: string, ms: number | null) => {
      const r = await db.withJob(wsL, (tx) =>
        recordInboundMessage(tx, wsL, {
          ...inbound({ channelId: chL, customerName: name, at: ago(ms ?? HOUR) }),
        }),
      );
      ids[key] = r.conversationId;
      if (ms === null) {
        await db.withJob(wsL, (tx) =>
          tx.execute(
            sql`UPDATE cf.conversations SET last_customer_msg_at = NULL, last_message_at = NULL WHERE id = ${r.conversationId}::uuid`,
          ),
        );
      }
    };
    await mk('fresh', 'An Nguyễn', 1 * HOUR);
    await mk('edge24', 'Bình_Trần', 24 * HOUR); // đúng 24 giờ: còn open
    await mk('human', 'Chi 100%', 24 * HOUR + 1);
    await mk('edge7', 'Dũng', 7 * 24 * HOUR); // đúng 7 ngày: còn human_only
    await mk('closed', 'Em', 7 * 24 * HOUR + 1);
    await mk('never', 'Phong', null);
  });

  const list = (f: Parameters<typeof listConversations>[2], o: { limit?: number } = {}) =>
    db.withActor(wsL, user, (tx) => listConversations(tx, wsL, f, { now, ...o }));

  it('lọc theo cửa sổ khớp conversationWindow ở các biên', async () => {
    const open = (await list({ window: 'open' })).items.map((c) => c.id).sort();
    expect(open).toEqual([ids.fresh, ids.edge24].sort());
    const human = (await list({ window: 'human_only' })).items.map((c) => c.id).sort();
    expect(human).toEqual([ids.human, ids.edge7].sort());
    const closed = (await list({ window: 'closed' })).items.map((c) => c.id).sort();
    expect(closed).toEqual([ids.closed, ids.never].sort());
  });

  it('sắp mới nhất trước, NULL cuối; phân trang con trỏ đi hết không trùng/sót', async () => {
    const all = (await list({})).items.map((c) => c.id);
    expect(all).toHaveLength(6);
    expect(all[all.length - 1]).toBe(ids.never);
    const seen: string[] = [];
    let cursor: Parameters<typeof listConversations>[3]['cursor'];
    for (let i = 0; i < 6; i++) {
      const page = await db.withActor(wsL, user, (tx) =>
        listConversations(tx, wsL, {}, { now, limit: 2, cursor }),
      );
      seen.push(...page.items.map((c) => c.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(all);
  });

  it('lọc người xử lý / chưa giao / trạng thái / AI / tìm tên (ký tự % và _ là chữ thường)', async () => {
    await db.withActor(wsL, user, (tx) => assignConversation(tx, wsL, ids.fresh as string, user));
    await db.withActor(wsL, user, (tx) =>
      setConversationStatus(tx, wsL, ids.edge7 as string, 'resolved'),
    );
    await db.withActor(wsL, user, (tx) =>
      setConversationAi(tx, wsL, ids.human as string, false, 'manual'),
    );
    expect((await list({ assignedTo: user })).items.map((c) => c.id)).toEqual([ids.fresh]);
    expect((await list({ assignedTo: 'unassigned' })).items).toHaveLength(5);
    expect((await list({ status: 'resolved' })).items.map((c) => c.id)).toEqual([ids.edge7]);
    expect((await list({ aiEnabled: false })).items.map((c) => c.id)).toEqual([ids.human]);
    expect((await list({ search: 'chi 100%' })).items.map((c) => c.id)).toEqual([ids.human]);
    expect((await list({ search: 'dũn_' })).items).toEqual([]);
    expect((await list({ search: 'bình_' })).items.map((c) => c.id)).toEqual([ids.edge24]);
  });

  it('danh sách không lộ hội thoại của workspace khác', async () => {
    expect(
      (await db.withActor(other, otherOwner, (tx) => listConversations(tx, wsL, {}, { now })))
        .items,
    ).toEqual([]);
  });
});
