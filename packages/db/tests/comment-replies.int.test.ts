import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database, FlowDb } from '../src/client';
import { cancelCommentReply, ReplyRejectedError, requestCommentReply } from '../src/replies';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * FB-REPLY (FR-042, ADR 008): hàng đợi gửi trả lời. Hàm DEFINER `cf.request_comment_reply` / `cf.cancel_comment_reply`,
 * bảng `cf.comment_replies` (không INSERT trực tiếp), trigger bình luận (người dùng không đặt trạng thái hệ thống).
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let wsOther: string;
let owner: string;
let staff: string;
let suspended: string;
let removed: string;
let stranger: string;
let channelOk: string;
let channelExpired: string;
let post: string;
let postExpired: string;

type Who = 'owner' | 'staff' | 'suspended' | 'removed' | 'stranger' | 'system' | 'bare' | 'job';
const ids: Record<string, string> = {};

async function comment(
  over: {
    status?: string;
    channel?: string;
    postId?: string;
    hidden?: boolean;
    merged?: boolean;
    replied?: boolean;
  } = {},
) {
  const r = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, created_time, status, is_hidden, external_reply_id)
     VALUES ($1, $2, $3, $4, 'u1', 'Khách', 'Giá bao nhiêu?', now(), $5, $6, $7) RETURNING id`,
    [
      ws,
      over.channel ?? channelOk,
      over.postId ?? post,
      `cm-${randomUUID()}`,
      over.status ?? 'pending_review',
      over.hidden ?? false,
      over.replied ? 'fb-reply-1' : null,
    ],
  );
  const id = r.rows[0].id as string;
  if (over.merged) {
    const other = await comment();
    await admin.query('UPDATE cf.comments SET merged_into_id = $2 WHERE id = $1', [id, other]);
  }
  return id;
}

async function as<T>(
  who: Who,
  fn: (tx: Database) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  try {
    const value =
      who === 'system'
        ? await db.withSystem(fn)
        : who === 'job'
          ? await db.withJob(ws, fn)
          : who === 'bare'
            ? await db.withWorkspace(ws, fn)
            : await db.withActor(ws, ids[who] as string, fn);
    return { ok: true, value };
  } catch (error) {
    if (error instanceof ReplyRejectedError) return { ok: false, reason: error.reason };
    const e = error as { cause?: { code?: string }; code?: string };
    return { ok: false, reason: e.cause?.code ?? e.code ?? 'unknown' };
  }
}

const request = (who: Who, commentId: string, text = 'Dạ còn size M ạ.') =>
  as(who, (tx) => requestCommentReply(tx, { commentId, text }));
const commentRow = async (id: string) =>
  (
    await admin.query(
      'SELECT status, external_reply_id, replied_by FROM cf.comments WHERE id = $1',
      [id],
    )
  ).rows[0];
const repliesOf = async (commentId: string) =>
  (
    await admin.query(
      'SELECT * FROM cf.comment_replies WHERE comment_id = $1 ORDER BY created_at',
      [commentId],
    )
  ).rows;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(4);
  ws = await seedWorkspace(admin);
  wsOther = await seedWorkspace(admin);
  for (const name of ['owner', 'staff', 'suspended', 'removed', 'stranger'])
    ids[name] = await seedUser(admin, name);
  owner = ids.owner as string;
  staff = ids.staff as string;
  suspended = ids.suspended as string;
  removed = ids.removed as string;
  stranger = ids.stranger as string;
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, ws, suspended, 'staff');
  await seedMember(admin, ws, removed, 'staff');
  await admin.query("UPDATE core.members SET status = 'suspended' WHERE user_id = $1", [suspended]);
  await admin.query("UPDATE core.members SET status = 'removed' WHERE user_id = $1", [removed]);
  const mk = async (workspace: string, status: string) =>
    (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name, status) VALUES ($1, 'facebook', $2, 'Page', $3) RETURNING id",
        [workspace, `p-${randomUUID()}`, status],
      )
    ).rows[0].id as string;
  channelOk = await mk(ws, 'connected');
  channelExpired = await mk(ws, 'expired');
  const mkPost = async (channel: string) =>
    (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [ws, channel, `post-${randomUUID()}`],
      )
    ).rows[0].id as string;
  post = await mkPost(channelOk);
  postExpired = await mkPost(channelExpired);
  void wsOther;
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-042 cf.request_comment_reply — ai được gọi', () => {
  it('Owner và Staff đang hoạt động được; suspended/removed/người ngoài/trần/job/ngữ cảnh trống bị 42501 và KHÔNG đổi gì', async () => {
    for (const who of ['owner', 'staff'] as const) {
      const id = await comment();
      const result = await request(who, id);
      expect(result.ok, who).toBe(true);
    }
    for (const who of ['suspended', 'removed', 'stranger', 'bare', 'job', 'system'] as const) {
      const id = await comment();
      const result = await request(who, id);
      expect(result, who).toEqual({
        ok: false,
        reason: 'forbidden',
      });
      expect((await commentRow(id)).status, who).toBe('pending_review');
      expect(await repliesOf(id), who).toHaveLength(0);
    }
  });
});

describe('FR-042 cf.request_comment_reply — điều kiện và hiệu ứng', () => {
  it('thành công: một outbox queued (nội dung đã trim, người yêu cầu, trạng thái trước), bình luận sending, action_logs KHÔNG chứa nội dung', async () => {
    const id = await comment({ status: 'needs_human' });
    const result = await request('staff', id, '  Dạ còn size M ạ.  ');
    expect(result.ok).toBe(true);
    const replies = await repliesOf(id);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      text: 'Dạ còn size M ạ.',
      requested_by: staff,
      status: 'queued',
      previous_status: 'needs_human',
      attempts: 0,
      channel_id: channelOk,
    });
    expect((await commentRow(id)).status).toBe('sending');
    const log = (
      await admin.query(
        "SELECT actor_type, actor_id, after FROM core.action_logs WHERE target_id = $1 AND action = 'comment.reply_requested'",
        [id],
      )
    ).rows;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor_type: 'user', actor_id: staff });
    expect(JSON.stringify(log)).not.toContain('size M');
  });

  it('cho phép từ new / pending_review / needs_human / send_failed; chặn các trạng thái khác (CF409) mà không đổi gì', async () => {
    for (const status of ['new', 'pending_review', 'needs_human', 'send_failed']) {
      expect((await request('owner', await comment({ status }))).ok, status).toBe(true);
    }
    for (const status of [
      'processing',
      'sending',
      'replied',
      'auto_replied',
      'scheduled_auto',
      'skipped',
      'spam_suspected',
      'hidden',
    ]) {
      const id = await comment({ status });
      expect(await request('owner', id), status).toEqual({ ok: false, reason: 'not_replyable' });
      expect(await repliesOf(id)).toHaveLength(0);
      expect((await commentRow(id)).status).toBe(status);
    }
  });

  it('đã có external_reply_id / đã ẩn / đã gộp → not_replyable', async () => {
    for (const over of [{ replied: true }, { hidden: true }, { merged: true }]) {
      expect(await request('owner', await comment(over)), JSON.stringify(over)).toEqual({
        ok: false,
        reason: 'not_replyable',
      });
    }
  });

  it('không thấy / workspace khác → not_found', async () => {
    expect(await request('owner', randomUUID())).toEqual({ ok: false, reason: 'not_found' });
    const other = await seedWorkspace(admin);
    const ch = (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'X') RETURNING id",
        [other, `p-${randomUUID()}`],
      )
    ).rows[0].id;
    const p = (
      await admin.query(
        "INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, 'x') RETURNING id",
        [other, ch],
      )
    ).rows[0].id;
    const foreign = (
      await admin.query(
        "INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text) VALUES ($1, $2, $3, 'c', 'u', 't') RETURNING id",
        [other, ch, p],
      )
    ).rows[0].id;
    expect(await request('owner', foreign)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('kênh không connected → channel_not_connected', async () => {
    const id = await comment({ channel: channelExpired, postId: postExpired });
    expect(await request('owner', id)).toEqual({ ok: false, reason: 'channel_not_connected' });
    expect((await commentRow(id)).status).toBe('pending_review');
  });

  it('người KHÁC đang giữ khóa mềm còn hạn → locked_by_other; khóa của chính mình hoặc đã hết hạn thì qua', async () => {
    const mine = await comment();
    const theirs = await comment();
    const expired = await comment();
    await admin.query(
      "UPDATE cf.comments SET locked_by = $2, locked_until = now() + interval '1 minute' WHERE id = $1",
      [mine, staff],
    );
    await admin.query(
      "UPDATE cf.comments SET locked_by = $2, locked_until = now() + interval '1 minute' WHERE id = $1",
      [theirs, owner],
    );
    await admin.query(
      "UPDATE cf.comments SET locked_by = $2, locked_until = now() - interval '1 second' WHERE id = $1",
      [expired, owner],
    );
    expect((await request('staff', mine)).ok).toBe(true);
    expect(await request('staff', theirs)).toEqual({ ok: false, reason: 'locked_by_other' });
    expect((await request('staff', expired)).ok).toBe(true);
  });

  it('nội dung rỗng/chỉ khoảng trắng/quá 8000 ký tự → invalid_text; đúng 8000 thì qua', async () => {
    for (const text of ['', '   \n  ', 'a'.repeat(8001)]) {
      expect(await request('owner', await comment(), text), text.slice(0, 5)).toEqual({
        ok: false,
        reason: 'invalid_text',
      });
    }
    expect((await request('owner', await comment(), 'a'.repeat(8000))).ok).toBe(true);
  });

  it('một yêu cầu đang hoạt động cho mỗi bình luận: gọi lần hai khi đang sending bị chặn; hai lệnh song song → đúng một thắng', async () => {
    const id = await comment();
    const [a, b] = await Promise.all([request('owner', id), request('staff', id)]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    expect(await repliesOf(id)).toHaveLength(1);
    expect(await request('owner', id)).toEqual({ ok: false, reason: 'not_replyable' });
  });
});

describe('FR-042 cf.cancel_comment_reply', () => {
  it('người yêu cầu hủy được yêu cầu còn queued và bình luận trở về trạng thái trước; người khác/đã sending → false', async () => {
    const id = await comment({ status: 'needs_human' });
    const created = await request('staff', id);
    if (!created.ok) throw new Error('request');
    const replyId = created.value;
    expect(await as('owner', (tx) => cancelCommentReply(tx, replyId))).toEqual({
      ok: true,
      value: false,
    });
    expect(await as('stranger', (tx) => cancelCommentReply(tx, replyId))).toMatchObject({
      ok: false,
    });
    expect(await as('staff', (tx) => cancelCommentReply(tx, replyId))).toEqual({
      ok: true,
      value: true,
    });
    expect((await commentRow(id)).status).toBe('needs_human');
    expect((await repliesOf(id))[0]).toMatchObject({
      status: 'cancelled',
      error_code: 'cancelled_by_user',
    });
    // gửi lại được sau khi hủy
    expect((await request('staff', id)).ok).toBe(true);
    // đã sending → không hủy được
    const second = (await repliesOf(id)).at(-1);
    await admin.query("UPDATE cf.comment_replies SET status = 'sending' WHERE id = $1", [
      second.id,
    ]);
    expect(await as('staff', (tx) => cancelCommentReply(tx, second.id))).toEqual({
      ok: true,
      value: false,
    });
  });
});

describe('FR-042 bảng comment_replies và trigger bình luận', () => {
  it('cf_app KHÔNG INSERT/DELETE trực tiếp ở mọi ngữ cảnh; người dùng không UPDATE; hệ thống chỉ cập nhật cột kết quả', async () => {
    const id = await comment();
    const created = await request('owner', id);
    if (!created.ok) throw new Error('request');
    const replyId = created.value;
    const attempt = (who: Who, statement: string) =>
      as(who, (tx) => tx.execute(sql.raw(statement)));
    const insert = `INSERT INTO cf.comment_replies (workspace_id, channel_id, comment_id, text, previous_status) VALUES ('${ws}', '${channelOk}', '${id}', 'x', 'new')`;
    for (const who of ['owner', 'staff', 'job', 'system', 'bare'] as const) {
      expect(await attempt(who, insert), `insert ${who}`).toMatchObject({ ok: false });
      expect(
        await attempt(who, `DELETE FROM cf.comment_replies WHERE id = '${replyId}'`),
        `delete ${who}`,
      ).toMatchObject({ ok: false });
    }
    for (const who of ['owner', 'staff', 'bare'] as const) {
      const r = await attempt(
        who,
        `UPDATE cf.comment_replies SET status = 'sent' WHERE id = '${replyId}'`,
      );
      // owner/staff/bare: policy UPDATE chỉ hệ thống → 0 dòng hoặc bị chặn; không bao giờ đổi
      expect(r.ok && (r.value as { rowCount: number }).rowCount, who).not.toBe(1);
    }
    expect((await repliesOf(id))[0].status).toBe('queued');
    const sys = await as('job', (tx) =>
      tx.execute(
        sql.raw(
          `UPDATE cf.comment_replies SET status = 'sending', attempts = attempts + 1 WHERE id = '${replyId}'`,
        ),
      ),
    );
    expect(sys.ok && (sys.value as { rowCount: number }).rowCount).toBe(1);
    expect(
      await attempt('job', `UPDATE cf.comment_replies SET text = 'sửa' WHERE id = '${replyId}'`),
    ).toMatchObject({ ok: false });
    expect(
      await attempt(
        'job',
        `UPDATE cf.comment_replies SET requested_by = NULL WHERE id = '${replyId}'`,
      ),
    ).toMatchObject({ ok: false });
  });

  it('thành viên chỉ đọc được yêu cầu của workspace mình; người ngoài đọc 0 dòng', async () => {
    const id = await comment();
    await request('owner', id);
    const seen = (who: Who) =>
      as(
        who,
        async (tx) =>
          (
            await tx.execute(
              sql.raw(`SELECT id FROM cf.comment_replies WHERE comment_id = '${id}'`),
            )
          ).rows.length,
      );
    expect(await seen('staff')).toEqual({ ok: true, value: 1 });
    expect(await seen('stranger')).toEqual({ ok: true, value: 0 });
    expect(await seen('job')).toEqual({ ok: true, value: 1 });
  });

  it('người dùng KHÔNG đặt được trạng thái hệ thống/dấu vết gửi trực tiếp trên bình luận; vẫn đặt được skipped/pending_review/needs_human', async () => {
    const id = await comment({ status: 'pending_review' });
    const update = (who: Who, setClause: string) =>
      as(who, (tx) =>
        tx.execute(sql.raw(`UPDATE cf.comments SET ${setClause} WHERE id = '${id}'`)),
      );
    for (const bad of [
      "status = 'sending'",
      "status = 'replied'",
      "status = 'send_failed'",
      "status = 'auto_replied'",
      "status = 'hidden'",
      "status = 'scheduled_auto'",
      "external_reply_id = 'giả'",
      'replied_at = now()',
      "label_source = 'llm'",
    ]) {
      for (const who of ['owner', 'staff'] as const) {
        expect((await update(who, bad)).ok, `${who} ${bad}`).toBe(false);
      }
    }
    expect((await update('staff', "label = 'hỏi giá', label_source = 'human'")).ok).toBe(true);
    for (const status of ['skipped', 'pending_review', 'needs_human']) {
      expect((await update('staff', `status = '${status}'`)).ok, status).toBe(true);
    }
    // từ trạng thái hệ thống thì người dùng không đổi được
    await admin.query("UPDATE cf.comments SET status = 'replied' WHERE id = $1", [id]);
    expect((await update('owner', "status = 'skipped'")).ok).toBe(false);
    // đường hệ thống (worker) đặt được
    expect((await update('job', "status = 'send_failed'")).ok).toBe(true);
  });

  it('hàm DEFINER có search_path cố định, PUBLIC không EXECUTE, chỉ cf_app', async () => {
    const rows = (
      await admin.query(
        `SELECT p.proname, p.prosecdef, has_function_privilege('public', p.oid, 'EXECUTE') AS pub, has_function_privilege('cf_app', p.oid, 'EXECUTE') AS app, p.proconfig::text AS config FROM pg_proc p WHERE p.pronamespace = 'cf'::regnamespace AND p.proname IN ('request_comment_reply', 'cancel_comment_reply') ORDER BY 1`,
      )
    ).rows;
    expect(rows.map((r) => r.proname)).toEqual(['cancel_comment_reply', 'request_comment_reply']);
    for (const r of rows) {
      expect(r.prosecdef).toBe(true);
      expect(r.pub).toBe(false);
      expect(r.app).toBe(true);
      expect(r.config).toContain('search_path=pg_catalog, core, cf, pg_temp');
    }
  });
});

describe('FR-042 trigger bình luận: dấu vết "ai trả lời" và khóa mềm của người khác', () => {
  const update = (who: Who, id: string, setClause: string) =>
    as(who, (tx) => tx.execute(sql.raw(`UPDATE cf.comments SET ${setClause} WHERE id = '${id}'`)));

  it('người dùng KHÔNG sửa replied_by (không nhận công, không xóa dấu vết) — kể cả đặt thành chính mình hoặc NULL', async () => {
    const id = await comment({ status: 'replied' });
    await admin.query(
      'UPDATE cf.comments SET replied_by = $2, external_reply_id = $3 WHERE id = $1',
      [id, stranger, 'fb-1'],
    );
    for (const who of ['owner', 'staff'] as const) {
      expect((await update(who, id, `replied_by = '${ids[who]}'`)).ok, `${who} đặt mình`).toBe(
        false,
      );
      expect((await update(who, id, 'replied_by = NULL')).ok, `${who} xóa`).toBe(false);
    }
    expect((await commentRow(id)).replied_by).toBe(stranger);
  });

  it('khóa mềm CÒN HẠN của người khác: không ghi đè, không xóa, không đổi hạn; hết hạn hoặc của chính mình thì được', async () => {
    const id = await comment();
    await admin.query(
      "UPDATE cf.comments SET locked_by = $2, locked_until = now() + interval '1 minute' WHERE id = $1",
      [id, owner],
    );
    expect(
      (
        await update(
          'staff',
          id,
          `locked_by = '${staff}', locked_until = now() + interval '2 minutes'`,
        )
      ).ok,
    ).toBe(false);
    expect((await update('staff', id, 'locked_by = NULL, locked_until = NULL')).ok).toBe(false);
    expect((await update('staff', id, "locked_until = now() + interval '1 hour'")).ok).toBe(false);
    expect((await update('owner', id, "locked_until = now() + interval '2 minutes'")).ok).toBe(
      true,
    ); // của chính mình
    await admin.query(
      "UPDATE cf.comments SET locked_until = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    expect(
      (
        await update(
          'staff',
          id,
          `locked_by = '${staff}', locked_until = now() + interval '2 minutes'`,
        )
      ).ok,
    ).toBe(true); // đã hết hạn
  });

  it('ràng buộc bảng: attempts >= 0, previous_status hợp lệ, một mã trả lời nền tảng chỉ gắn một yêu cầu trong một kênh', async () => {
    const a = await comment();
    const b = await comment();
    const ra = await request('owner', a);
    const rb = await request('owner', b);
    if (!ra.ok || !rb.ok) throw new Error('request');
    const code = async (statement: string) => {
      try {
        await admin.query(statement);
        return 'ok';
      } catch (error) {
        return (error as { code?: string }).code ?? 'unknown';
      }
    };
    expect(await code(`UPDATE cf.comment_replies SET attempts = -1 WHERE id = '${ra.value}'`)).toBe(
      '23514',
    );
    expect(
      await code(
        `UPDATE cf.comment_replies SET previous_status = 'replied' WHERE id = '${ra.value}'`,
      ),
    ).toBe('23514');
    expect(
      await code(
        `UPDATE cf.comment_replies SET external_reply_id = 'fb-trung' WHERE id = '${ra.value}'`,
      ),
    ).toBe('ok');
    expect(
      await code(
        `UPDATE cf.comment_replies SET external_reply_id = 'fb-trung' WHERE id = '${rb.value}'`,
      ),
    ).toBe('23505');
  });
});
