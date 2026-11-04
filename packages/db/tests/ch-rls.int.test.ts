import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createAdminPool,
  createAppDb,
  newId,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * CH-SCHEMA: channels / posts / comments / webhook_events. Ai được ghi gì (cùng role cf_app; phân biệt bằng app.user_id):
 *  - channels: Owner đang hoạt động hoặc HỆ THỐNG (không có người dùng); Staff không.
 *  - posts, comments: thành viên đang hoạt động hoặc hệ thống.
 *  - webhook_events: chỉ hệ thống ghi; Owner hoặc hệ thống đọc.
 * Không bảng nào cho DELETE. Token Page và cột khóa gửi do Admin không đọc/ghi được bằng cf_app.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
const ids: Record<string, string> = {};
let channel: string;
let channelOther: string;
let post: string;
let comment: string;
let webhookRow: string;

type Who = 'owner' | 'staff' | 'suspended' | 'removed' | 'stranger' | 'otherOwner' | 'system';
const WHO: Who[] = ['owner', 'staff', 'suspended', 'removed', 'stranger', 'otherOwner', 'system'];

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  for (const name of ['owner', 'staff', 'suspended', 'removed', 'stranger', 'otherOwner']) {
    ids[name] = await seedUser(admin, name);
  }
  await seedMember(admin, ws, ids.owner as string, 'owner');
  await seedMember(admin, ws, ids.staff as string, 'staff');
  await seedMember(admin, ws, ids.suspended as string, 'staff');
  await seedMember(admin, ws, ids.removed as string, 'staff');
  await admin.query("UPDATE core.members SET status = 'suspended' WHERE user_id = $1", [
    ids.suspended,
  ]);
  await admin.query("UPDATE core.members SET status = 'removed' WHERE user_id = $1", [ids.removed]);
  await seedMember(admin, other, ids.otherOwner as string, 'owner');

  const ch = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page A') RETURNING id",
    [ws, `p-${newId()}`],
  );
  channel = ch.rows[0].id;
  const cho = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page B') RETURNING id",
    [other, `p-${newId()}`],
  );
  channelOther = cho.rows[0].id;
  const p = await admin.query(
    "INSERT INTO cf.posts (workspace_id, channel_id, external_id, message) VALUES ($1, $2, $3, 'bài 1') RETURNING id",
    [ws, channel, `post-${newId()}`],
  );
  post = p.rows[0].id;
  const c = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text)
     VALUES ($1, $2, $3, $4, 'u1', 'giá bao nhiêu?') RETURNING id`,
    [ws, channel, post, `cm-${newId()}`],
  );
  comment = c.rows[0].id;
  const w = await admin.query(
    "INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload) VALUES ($1, 'facebook', $2, '{}') RETURNING id",
    [ws, `h-${newId()}`],
  );
  webhookRow = w.rows[0].id;
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

/** Chạy SQL với người gọi `who` ở workspace ws; trả số dòng, hoặc 'denied' (42501). */
async function run(who: Who, text: string, workspaceId = ws): Promise<number | 'denied'> {
  const exec = (tx: Parameters<Parameters<FlowDb['withWorkspace']>[1]>[0]) =>
    tx.execute(sql.raw(text));
  try {
    const result =
      who === 'system'
        ? await db.withWorkspace(workspaceId, exec)
        : await db.withActor(workspaceId, ids[who] as string, exec);
    return result.rowCount ?? result.rows.length;
  } catch (error) {
    const e = error as { cause?: { code?: string }; code?: string };
    if ((e.cause?.code ?? e.code) === '42501') return 'denied';
    throw error;
  }
}

const matrix = async (text: (who: Who) => string) => {
  const out = {} as Record<Who, number | 'denied'>;
  for (const who of WHO) out[who] = await run(who, text(who));
  return out;
};

/** Chỉ những vai trò trong `allowed` được ghi (kết quả = `count`); còn lại bị chặn hoặc không tác động dòng nào. */
function expectOnly(results: Record<Who, number | 'denied'>, allowed: Who[], count = 1) {
  for (const who of WHO) {
    if (allowed.includes(who)) expect(results[who], `${who} phải được phép`).toBe(count);
    else expect([0, 'denied'], `${who} phải bị chặn`).toContain(results[who]);
  }
}

describe('FR-010 channels', () => {
  it('INSERT: chỉ Owner đang hoạt động hoặc hệ thống; Staff và người ngoài bị chặn', async () => {
    const results = await matrix(
      (who) =>
        `INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ('${ws}', 'facebook', 'ins-${who}-${newId()}', 'K')`,
    );
    expectOnly(results, ['owner', 'system']);
  });

  it('UPDATE các cột cho phép: chỉ Owner hoặc hệ thống', async () => {
    const results = await matrix(
      () =>
        `UPDATE cf.channels SET name = 'Đổi', reply_language = 'vi', status = 'connected' WHERE id = '${channel}'`,
    );
    expectOnly(results, ['owner', 'system']);
  });

  it('SELECT: thành viên đang hoạt động và hệ thống thấy kênh; người ngoài/đã gỡ không', async () => {
    const results = await matrix(
      () => `SELECT id, name, status FROM cf.channels WHERE id = '${channel}'`,
    );
    for (const who of ['owner', 'staff', 'system'] as const) expect(results[who], who).toBe(1);
    for (const who of ['suspended', 'removed', 'stranger', 'otherOwner'] as const)
      expect(results[who], who).toBe(0);
  });

  it('token Page (access_token_enc) không đọc/ghi được bằng cf_app, kể cả Owner và hệ thống', async () => {
    for (const who of ['owner', 'system'] as const) {
      expect(
        await run(who, `SELECT access_token_enc FROM cf.channels WHERE id = '${channel}'`),
        who,
      ).toBe('denied');
      expect(
        await run(who, `UPDATE cf.channels SET access_token_enc = 'x' WHERE id = '${channel}'`),
        who,
      ).toBe('denied');
      expect(
        await run(
          who,
          `INSERT INTO cf.channels (workspace_id, platform, external_id, name, access_token_enc) VALUES ('${ws}', 'facebook', 'tk-${newId()}', 'K', 'x')`,
        ),
        who,
      ).toBe('denied');
    }
  });

  it('cột khóa gửi do Admin (send_suspended_*, rate_limit_override) không sửa được bằng cf_app', async () => {
    for (const set of [
      "send_suspended_until = now() + interval '1 day'",
      "send_suspended_reason = 'x'",
      "rate_limit_override = '{}'",
    ]) {
      for (const who of ['owner', 'system'] as const) {
        expect(
          await run(who, `UPDATE cf.channels SET ${set} WHERE id = '${channel}'`),
          `${who} ${set}`,
        ).toBe('denied');
      }
    }
    expect(
      await run(
        'owner',
        `SELECT send_suspended_until, send_suspended_reason FROM cf.channels WHERE id = '${channel}'`,
      ),
    ).toBe(1);
  });

  it('cô lập: Owner của A không thấy/sửa kênh của B dù biết id', async () => {
    expect(await run('owner', `SELECT id FROM cf.channels WHERE id = '${channelOther}'`)).toBe(0);
    expect(
      await run('owner', `UPDATE cf.channels SET name = 'x' WHERE id = '${channelOther}'`),
    ).toBe(0);
    expect(await run('system', `SELECT id FROM cf.channels WHERE id = '${channelOther}'`)).toBe(0);
  });
});

describe('posts và comments', () => {
  it('posts INSERT/UPDATE: thành viên đang hoạt động hoặc hệ thống', async () => {
    const insert = await matrix(
      (who) =>
        `INSERT INTO cf.posts (workspace_id, channel_id, external_id, message) VALUES ('${ws}', '${channel}', 'p-${who}-${newId()}', 'm')`,
    );
    expectOnly(insert, ['owner', 'staff', 'system']);
    const update = await matrix(() => `UPDATE cf.posts SET message = 'sửa' WHERE id = '${post}'`);
    expectOnly(update, ['owner', 'staff', 'system']);
  });

  it('comments INSERT/UPDATE: thành viên đang hoạt động hoặc hệ thống (Staff duyệt/đổi trạng thái)', async () => {
    const insert = await matrix(
      (who) =>
        `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text)
         VALUES ('${ws}', '${channel}', '${post}', 'c-${who}-${newId()}', 'u', 't')`,
    );
    expectOnly(insert, ['owner', 'staff', 'system']);
    const update = await matrix(
      () => `UPDATE cf.comments SET status = 'pending_review' WHERE id = '${comment}'`,
    );
    expectOnly(update, ['owner', 'staff', 'system']);
  });

  it('cô lập: không đọc/sửa bình luận của workspace khác', async () => {
    const otherPost = (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [other, channelOther, `op-${newId()}`],
      )
    ).rows[0].id;
    const otherComment = (
      await admin.query(
        `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text)
         VALUES ($1, $2, $3, $4, 'u', 't') RETURNING id`,
        [other, channelOther, otherPost, `oc-${newId()}`],
      )
    ).rows[0].id;
    for (const who of ['owner', 'staff', 'system'] as const) {
      expect(await run(who, `SELECT id FROM cf.comments WHERE id = '${otherComment}'`), who).toBe(
        0,
      );
      expect(
        await run(who, `UPDATE cf.comments SET status = 'hidden' WHERE id = '${otherComment}'`),
        who,
      ).toBe(0);
    }
  });
});

describe('FR-021 webhook_events', () => {
  it('INSERT: chỉ hệ thống (không người dùng); Owner cũng không ghi được', async () => {
    const results = await matrix(
      (who) =>
        `INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload) VALUES ('${ws}', 'facebook', 'h-${who}-${newId()}', '{}')`,
    );
    expectOnly(results, ['system']);
  });

  it('UPDATE trạng thái xử lý: chỉ hệ thống', async () => {
    const results = await matrix(
      () =>
        `UPDATE cf.webhook_events SET status = 'done', attempts = attempts + 1 WHERE id = '${webhookRow}'`,
    );
    expectOnly(results, ['system']);
  });

  it('SELECT: Owner và hệ thống đọc được (payload có tên khách); Staff và người ngoài không', async () => {
    const results = await matrix(
      () => `SELECT id FROM cf.webhook_events WHERE id = '${webhookRow}'`,
    );
    expect(results.owner).toBe(1);
    expect(results.system).toBe(1);
    for (const who of ['staff', 'suspended', 'removed', 'stranger', 'otherOwner'] as const) {
      expect(results[who], who).toBe(0);
    }
  });

  it('dòng chưa map workspace (workspace_id NULL) không hiện cho bất kỳ ngữ cảnh workspace nào', async () => {
    const orphan = (
      await admin.query(
        "INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload) VALUES (NULL, 'facebook', $1, '{}') RETURNING id",
        [`orphan-${newId()}`],
      )
    ).rows[0].id;
    for (const who of WHO) {
      expect(await run(who, `SELECT id FROM cf.webhook_events WHERE id = '${orphan}'`), who).toBe(
        0,
      );
    }
  });
});

describe('không có DELETE', () => {
  it('cf_app không xóa được dòng nào của 4 bảng (kể cả Owner và hệ thống)', async () => {
    const targets = [
      ['cf.channels', channel],
      ['cf.posts', post],
      ['cf.comments', comment],
      ['cf.webhook_events', webhookRow],
    ] as const;
    for (const [table, id] of targets) {
      for (const who of ['owner', 'system'] as const) {
        expect(await run(who, `DELETE FROM ${table} WHERE id = '${id}'`), `${who} ${table}`).toBe(
          'denied',
        );
      }
    }
  });
});
