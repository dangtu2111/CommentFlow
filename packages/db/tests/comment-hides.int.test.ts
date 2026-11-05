import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database, FlowDb } from '../src/client';
import { cancelCommentHide, HideRejectedError, requestCommentHide } from '../src/hides';
import { getCommentDetail } from '../src/queries/comment-detail';
import { ReplyRejectedError, requestCommentReply } from '../src/replies';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * FB-HIDE (FR-044, ADR 009): hàng đợi ẩn/bỏ ẩn. Hàm DEFINER `cf.request_comment_hide` / `cf.cancel_comment_hide`, bảng
 * `cf.comment_hides` (không INSERT trực tiếp), trigger bình luận (người dùng không tự đổi `is_hidden`).
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let wsOther: string;
let channelOk: string;
let channelExpired: string;
let channelOther: string;
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
    deleted?: boolean;
    replyId?: string | null;
    workspace?: string;
  } = {},
) {
  const workspace = over.workspace ?? ws;
  const channel =
    over.channel ?? (workspace === ws ? channelOk : (channelOther as string)) ?? channelOk;
  const r = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, created_time, status, is_hidden, external_reply_id)
     VALUES ($1, $2, $3, $4, 'u1', 'Khách', 'Giá bao nhiêu?', now(), $5, $6, $7) RETURNING id`,
    [
      workspace,
      channel,
      over.postId ?? (workspace === ws ? post : await postOf(workspace, channel)),
      `cm-${randomUUID()}`,
      over.status ?? 'pending_review',
      over.hidden ?? false,
      over.replyId ?? null,
    ],
  );
  const id = r.rows[0].id as string;
  if (over.merged) {
    const other = await comment();
    await admin.query('UPDATE cf.comments SET merged_into_id = $2 WHERE id = $1', [id, other]);
  }
  if (over.deleted) {
    await admin.query('UPDATE cf.comments SET deleted_at = now() WHERE id = $1', [id]);
  }
  return id;
}

async function postOf(workspace: string, channel: string) {
  const r = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
    [workspace, channel, `post-${randomUUID()}`],
  );
  return r.rows[0].id as string;
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
    if (error instanceof HideRejectedError || error instanceof ReplyRejectedError)
      return { ok: false, reason: error.reason };
    const e = error as { cause?: { code?: string }; code?: string };
    return { ok: false, reason: e.cause?.code ?? e.code ?? 'unknown' };
  }
}

const request = (who: Who, commentId: string, hide = true) =>
  as(who, (tx) => requestCommentHide(tx, { commentId, hide }));
const commentRow = async (id: string) =>
  (await admin.query('SELECT status, is_hidden FROM cf.comments WHERE id = $1', [id])).rows[0];
const hidesOf = async (commentId: string) =>
  (
    await admin.query('SELECT * FROM cf.comment_hides WHERE comment_id = $1 ORDER BY created_at', [
      commentId,
    ])
  ).rows;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(4);
  ws = await seedWorkspace(admin);
  wsOther = await seedWorkspace(admin);
  for (const name of ['owner', 'staff', 'suspended', 'removed', 'stranger'])
    ids[name] = await seedUser(admin, name);
  await seedMember(admin, ws, ids.owner as string, 'owner');
  await seedMember(admin, ws, ids.staff as string, 'staff');
  await seedMember(admin, ws, ids.suspended as string, 'staff');
  await seedMember(admin, ws, ids.removed as string, 'staff');
  await admin.query("UPDATE core.members SET status = 'suspended' WHERE user_id = $1", [
    ids.suspended,
  ]);
  await admin.query("UPDATE core.members SET status = 'removed' WHERE user_id = $1", [ids.removed]);
  const mk = async (workspace: string, status: string) =>
    (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name, status) VALUES ($1, 'facebook', $2, 'Page', $3) RETURNING id",
        [workspace, `p-${randomUUID()}`, status],
      )
    ).rows[0].id as string;
  channelOk = await mk(ws, 'connected');
  channelExpired = await mk(ws, 'expired');
  channelOther = await mk(wsOther, 'connected');
  post = await postOf(ws, channelOk);
  postExpired = await postOf(ws, channelExpired);
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-044 cf.request_comment_hide — ai được gọi', () => {
  it('FR-044 Owner và Staff đang hoạt động được; suspended/removed/người ngoài/trần/job/hệ thống bị 42501 và KHÔNG đổi gì', async () => {
    for (const who of ['owner', 'staff'] as const) {
      const id = await comment();
      const result = await request(who, id);
      expect(result.ok, who).toBe(true);
    }
    for (const who of ['suspended', 'removed', 'stranger', 'bare', 'job', 'system'] as const) {
      const id = await comment();
      expect(await request(who, id), who).toEqual({ ok: false, reason: 'forbidden' });
      expect(await hidesOf(id), who).toHaveLength(0);
      expect((await commentRow(id)).is_hidden, who).toBe(false);
    }
  });
});

describe('FR-044 cf.request_comment_hide — điều kiện và hiệu ứng', () => {
  it('FR-044 thành công: một yêu cầu queued (hành động, người yêu cầu, trạng thái trước); bình luận KHÔNG đổi; action_logs không chứa nội dung', async () => {
    const id = await comment({ status: 'needs_human' });
    const result = await request('staff', id);
    if (!result.ok || !result.value) throw new Error('request');
    const rows = await hidesOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.value,
      action: 'hide',
      status: 'queued',
      attempts: 0,
      requested_by: ids.staff,
      previous_status: 'needs_human',
      workspace_id: ws,
      channel_id: channelOk,
    });
    expect(await commentRow(id)).toEqual({ status: 'needs_human', is_hidden: false });
    const logs = (
      await admin.query(
        "SELECT action, actor_id, after::text AS after FROM core.action_logs WHERE target_id = $1 AND action = 'comment.hide_requested'",
        [id],
      )
    ).rows;
    expect(logs).toHaveLength(1);
    expect(logs[0].actor_id).toBe(ids.staff);
    expect(logs[0].after).not.toContain('Giá bao nhiêu');
  });

  it('FR-044 ẩn được từ new/pending_review/needs_human/send_failed/skipped/spam_suspected/replied/auto_replied; chặn processing/scheduled_auto/sending/hidden (CF409) không đổi gì', async () => {
    for (const status of [
      'new',
      'pending_review',
      'needs_human',
      'send_failed',
      'skipped',
      'spam_suspected',
      'replied',
      'auto_replied',
    ]) {
      const id = await comment({ status });
      expect((await request('owner', id)).ok, status).toBe(true);
    }
    for (const status of ['processing', 'scheduled_auto', 'sending']) {
      const id = await comment({ status });
      expect(await request('owner', id), status).toEqual({ ok: false, reason: 'not_hideable' });
      expect(await hidesOf(id)).toHaveLength(0);
    }
  });

  it('FR-044 đã xóa trên nền tảng / đã gộp → not_hideable', async () => {
    for (const over of [{ deleted: true }, { merged: true }]) {
      const id = await comment(over);
      expect(await request('owner', id)).toEqual({ ok: false, reason: 'not_hideable' });
      expect(await hidesOf(id)).toHaveLength(0);
    }
  });

  it('FR-044 không thấy / bình luận của workspace khác → not_found', async () => {
    expect(await request('owner', randomUUID())).toEqual({ ok: false, reason: 'not_found' });
    const other = await comment({ workspace: wsOther });
    expect(await request('owner', other)).toEqual({ ok: false, reason: 'not_found' });
    expect(await hidesOf(other)).toHaveLength(0);
  });

  it('FR-044 kênh không connected → channel_not_connected', async () => {
    const id = await comment({ channel: channelExpired, postId: postExpired });
    expect(await request('owner', id)).toEqual({ ok: false, reason: 'channel_not_connected' });
    expect(await hidesOf(id)).toHaveLength(0);
  });

  it('FR-044 người KHÁC giữ khóa mềm còn hạn → locked_by_other; khóa của chính mình hoặc đã hết hạn thì qua', async () => {
    const id = await comment();
    await admin.query(
      "UPDATE cf.comments SET locked_by = $2, locked_until = now() + interval '2 minutes' WHERE id = $1",
      [id, ids.owner],
    );
    expect(await request('staff', id)).toEqual({ ok: false, reason: 'locked_by_other' });
    expect((await request('owner', id)).ok).toBe(true);
    const expired = await comment();
    await admin.query(
      "UPDATE cf.comments SET locked_by = $2, locked_until = now() - interval '1 minute' WHERE id = $1",
      [expired, ids.owner],
    );
    expect((await request('staff', expired)).ok).toBe(true);
  });

  it('FR-044 đang có yêu cầu trả lời chạy (sending) → not_hideable; ngược lại đang có yêu cầu ẩn → trả lời bị CF409', async () => {
    const replying = await comment();
    const reply = await as('owner', (tx) =>
      requestCommentReply(tx, { commentId: replying, text: 'Dạ ạ' }),
    );
    expect(reply.ok).toBe(true);
    expect(await request('owner', replying)).toEqual({ ok: false, reason: 'not_hideable' });

    const hiding = await comment();
    expect((await request('owner', hiding)).ok).toBe(true);
    const blocked = await as('owner', (tx) =>
      requestCommentReply(tx, { commentId: hiding, text: 'Dạ ạ' }),
    );
    expect(blocked).toEqual({ ok: false, reason: 'not_replyable' });
    expect((await commentRow(hiding)).status).toBe('pending_review');
  });
});

describe('FR-044 idempotent và song song', () => {
  it('FR-044 ẩn khi đã ẩn, bỏ ẩn khi chưa ẩn → NULL và không tạo dòng; ẩn lần hai khi đã có yêu cầu ẩn đang chạy → NULL', async () => {
    const hidden = await comment({ status: 'hidden', hidden: true });
    expect(await request('owner', hidden, true)).toEqual({ ok: true, value: null });
    const visible = await comment();
    expect(await request('owner', visible, false)).toEqual({ ok: true, value: null });
    expect(await hidesOf(hidden)).toHaveLength(0);
    expect(await hidesOf(visible)).toHaveLength(0);

    const id = await comment();
    const first = await request('owner', id, true);
    expect(first.ok && first.value).toBeTruthy();
    expect(await request('staff', id, true)).toEqual({ ok: true, value: null });
    expect(await hidesOf(id)).toHaveLength(1);
  });

  it('FR-044 yêu cầu trái chiều khi đang có yêu cầu hoạt động → not_hideable (kiểm trước cả kiểm "đã ở trạng thái đích")', async () => {
    const hidden = await comment({ status: 'hidden', hidden: true });
    const unhide = await request('owner', hidden, false);
    expect(unhide.ok && unhide.value).toBeTruthy();
    expect(await request('owner', hidden, true)).toEqual({ ok: false, reason: 'not_hideable' });
    const visible = await comment();
    expect((await request('owner', visible, true)).ok).toBe(true);
    expect(await request('owner', visible, false)).toEqual({ ok: false, reason: 'not_hideable' });
  });

  it('FR-044 hai lệnh song song cho cùng bình luận → đúng một yêu cầu', async () => {
    const id = await comment();
    const results = await Promise.all([
      request('owner', id),
      request('staff', id),
      request('owner', id),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && r.value).length).toBe(1);
    expect(await hidesOf(id)).toHaveLength(1);
  });

  it('FR-044 bỏ ẩn đặt trạng thái khôi phục = trạng thái trước lần ẩn gần nhất (hoặc replied / pending_review khi không có)', async () => {
    const id = await comment({ status: 'needs_human' });
    const hideId = (await request('owner', id)) as { ok: true; value: string };
    await admin.query("UPDATE cf.comment_hides SET status = 'done' WHERE id = $1", [hideId.value]);
    await admin.query("UPDATE cf.comments SET status = 'hidden', is_hidden = true WHERE id = $1", [
      id,
    ]);
    const unhide = (await request('owner', id, false)) as { ok: true; value: string };
    const row = (await admin.query('SELECT previous_status FROM cf.comment_hides WHERE id = $1', [
      unhide.value,
    ])) as { rows: { previous_status: string }[] };
    expect(row.rows[0]?.previous_status).toBe('needs_human');

    const bare = await comment({ status: 'hidden', hidden: true });
    const u2 = (await request('owner', bare, false)) as { ok: true; value: string };
    expect(
      (await admin.query('SELECT previous_status FROM cf.comment_hides WHERE id = $1', [u2.value]))
        .rows[0].previous_status,
    ).toBe('pending_review');
    const replied = await comment({ status: 'hidden', hidden: true, replyId: 'fb-reply-1' });
    const u3 = (await request('owner', replied, false)) as { ok: true; value: string };
    expect(
      (await admin.query('SELECT previous_status FROM cf.comment_hides WHERE id = $1', [u3.value]))
        .rows[0].previous_status,
    ).toBe('replied');
  });
});

describe('FR-044 cf.cancel_comment_hide', () => {
  it('FR-044 người yêu cầu hủy được yêu cầu còn queued (bình luận không đổi); người khác/đã sending/đã hủy → false', async () => {
    const id = await comment();
    const created = await request('staff', id);
    if (!created.ok || !created.value) throw new Error('request');
    expect(await as('staff', (tx) => cancelCommentHide(tx, created.value as string))).toEqual({
      ok: true,
      value: true,
    });
    expect((await hidesOf(id))[0]).toMatchObject({
      status: 'cancelled',
      error_code: 'cancelled_by_user',
    });
    expect(await commentRow(id)).toEqual({ status: 'pending_review', is_hidden: false });
    expect(await as('staff', (tx) => cancelCommentHide(tx, created.value as string))).toEqual({
      ok: true,
      value: false,
    });
    // hủy xong thì có thể yêu cầu lại
    expect((await request('staff', id)).ok).toBe(true);

    const sending = await comment();
    const s = await request('staff', sending);
    if (!s.ok || !s.value) throw new Error('request');
    await admin.query("UPDATE cf.comment_hides SET status = 'sending' WHERE id = $1", [s.value]);
    expect(await as('staff', (tx) => cancelCommentHide(tx, s.value as string))).toEqual({
      ok: true,
      value: false,
    });
    for (const who of ['stranger', 'suspended', 'bare', 'job'] as const) {
      const r = await as(who, (tx) => cancelCommentHide(tx, s.value as string));
      expect(r.ok, who).toBe(false);
    }
  });
});

describe('FR-044 bảng comment_hides, RLS và trigger bình luận', () => {
  it('FR-044 cf_app KHÔNG INSERT/DELETE trực tiếp ở mọi ngữ cảnh; người dùng không UPDATE; hệ thống chỉ cập nhật cột kết quả', async () => {
    const id = await comment();
    const created = await request('owner', id);
    if (!created.ok || !created.value) throw new Error('request');
    const hideId = created.value;
    const attempt = (who: Who, statement: string) =>
      as(who, (tx) => tx.execute(sql.raw(statement)));
    const insert = `INSERT INTO cf.comment_hides (workspace_id, channel_id, comment_id, action, previous_status) VALUES ('${ws}', '${channelOk}', '${id}', 'hide', 'new')`;
    for (const who of ['owner', 'staff', 'job', 'system', 'bare'] as const) {
      expect(await attempt(who, insert), `insert ${who}`).toMatchObject({ ok: false });
      expect(
        await attempt(who, `DELETE FROM cf.comment_hides WHERE id = '${hideId}'`),
        `delete ${who}`,
      ).toMatchObject({ ok: false });
    }
    for (const who of ['owner', 'staff', 'bare'] as const) {
      const r = await attempt(
        who,
        `UPDATE cf.comment_hides SET status = 'done' WHERE id = '${hideId}'`,
      );
      expect(r.ok && (r.value as { rowCount: number }).rowCount, who).not.toBe(1);
    }
    expect((await hidesOf(id))[0].status).toBe('queued');
    const sys = await attempt(
      'job',
      `UPDATE cf.comment_hides SET status = 'sending', attempts = attempts + 1 WHERE id = '${hideId}'`,
    );
    expect(sys.ok && (sys.value as { rowCount: number }).rowCount).toBe(1);
    for (const column of ['action', 'requested_by', 'comment_id']) {
      expect(
        await attempt(
          'job',
          `UPDATE cf.comment_hides SET ${column} = ${column} WHERE id = '${hideId}'`,
        ),
        column,
      ).toMatchObject({ ok: false });
    }
  });

  it('FR-044 previous_status do hệ thống (worker) cập nhật được; người dùng thì không', async () => {
    const id = await comment({ status: 'needs_human' });
    const created = await request('owner', id);
    if (!created.ok || !created.value) throw new Error('request');
    const stmt = `UPDATE cf.comment_hides SET previous_status = 'skipped' WHERE id = '${created.value}'`;
    for (const who of ['owner', 'staff'] as const) {
      const r = await as(who, (tx) => tx.execute(sql.raw(stmt)));
      expect(r.ok && (r.value as { rowCount: number }).rowCount, who).not.toBe(1);
    }
    const sys = await as('job', (tx) => tx.execute(sql.raw(stmt)));
    expect(sys.ok && (sys.value as { rowCount: number }).rowCount).toBe(1);
    expect((await hidesOf(id))[0].previous_status).toBe('skipped');
  });

  it('FR-044 thành viên chỉ đọc được yêu cầu của workspace mình; người ngoài đọc 0 dòng', async () => {
    const id = await comment();
    await request('owner', id);
    const read = (who: Who) =>
      as(who, (tx) =>
        tx.execute(sql.raw(`SELECT id FROM cf.comment_hides WHERE comment_id = '${id}'`)),
      );
    for (const who of ['owner', 'staff'] as const) {
      const r = await read(who);
      expect(r.ok && (r.value as { rows: unknown[] }).rows.length, who).toBe(1);
    }
    for (const who of ['stranger', 'suspended', 'removed'] as const) {
      const r = await read(who);
      expect(r.ok && (r.value as { rows: unknown[] }).rows.length, who).toBe(0);
    }
  });

  it('FR-044 người dùng KHÔNG tự đổi comments.is_hidden hay đặt status hidden; hệ thống (worker) đặt được; trạng thái khác của người dùng vẫn hoạt động', async () => {
    const id = await comment({ status: 'pending_review' });
    const update = (who: Who, setClause: string) =>
      as(who, (tx) =>
        tx.execute(sql.raw(`UPDATE cf.comments SET ${setClause} WHERE id = '${id}'`)),
      );
    for (const bad of [
      'is_hidden = true',
      "status = 'hidden'",
      "status = 'hidden', is_hidden = true",
    ]) {
      for (const who of ['owner', 'staff'] as const) {
        expect((await update(who, bad)).ok, `${who} ${bad}`).toBe(false);
      }
    }
    expect((await commentRow(id)).is_hidden).toBe(false);
    expect((await update('staff', "status = 'skipped'")).ok).toBe(true);
    expect((await update('job', "is_hidden = true, status = 'hidden'")).ok).toBe(true);
    expect(await commentRow(id)).toEqual({ status: 'hidden', is_hidden: true });
    // đã ẩn: người dùng không tự bỏ ẩn
    expect((await update('owner', 'is_hidden = false')).ok).toBe(false);
    expect((await update('owner', "status = 'pending_review'")).ok).toBe(false);
    expect((await update('job', "is_hidden = false, status = 'pending_review'")).ok).toBe(true);
  });

  it('FR-044 hàm DEFINER có search_path cố định, PUBLIC không EXECUTE, chỉ cf_app', async () => {
    const rows = (
      await admin.query(
        `SELECT p.proname, p.prosecdef, has_function_privilege('public', p.oid, 'EXECUTE') AS pub, has_function_privilege('cf_app', p.oid, 'EXECUTE') AS app, p.proconfig::text AS config FROM pg_proc p WHERE p.pronamespace = 'cf'::regnamespace AND p.proname IN ('request_comment_hide', 'cancel_comment_hide') ORDER BY 1`,
      )
    ).rows;
    expect(rows.map((r) => r.proname)).toEqual(['cancel_comment_hide', 'request_comment_hide']);
    for (const r of rows) {
      expect(r.prosecdef).toBe(true);
      expect(r.pub).toBe(false);
      expect(r.app).toBe(true);
      expect(r.config).toContain('search_path=pg_catalog, core, cf, pg_temp');
    }
  });

  it('FR-044 ràng buộc bảng: hành động/trạng thái hợp lệ, attempts >= 0, previous_status hợp lệ', async () => {
    const id = await comment();
    const insert = (action: string, status: string, attempts: number, previous: string) =>
      admin.query(
        'INSERT INTO cf.comment_hides (workspace_id, channel_id, comment_id, action, status, attempts, previous_status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [ws, channelOk, id, action, status, attempts, previous],
      );
    await expect(insert('delete', 'done', 0, 'new')).rejects.toThrow();
    await expect(insert('hide', 'bogus', 0, 'new')).rejects.toThrow();
    await expect(insert('hide', 'done', -1, 'new')).rejects.toThrow();
    await expect(insert('hide', 'done', 0, 'sending')).rejects.toThrow();
    await expect(insert('hide', 'done', 0, 'new')).resolves.toBeDefined();
    await expect(
      admin.query(
        'INSERT INTO cf.comment_hides (workspace_id, channel_id, comment_id, action, status, error_code, previous_status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [ws, channelOk, id, 'hide', 'failed', 'x'.repeat(65), 'new'],
      ),
    ).rejects.toThrow();
  });
});

describe('FR-044 chi tiết bình luận đọc trạng thái ẩn', () => {
  it('FR-044 getCommentDetail trả isHidden và yêu cầu ẩn MỚI NHẤT (hành động, trạng thái, mã lỗi); chưa có → null', async () => {
    const id = await comment();
    const detail = () =>
      db.withActor(ws, ids.owner as string, (tx) =>
        getCommentDetail(tx, ws, id, ids.owner as string),
      );
    expect(await detail()).toMatchObject({ isHidden: false, latestHide: null });
    const created = await request('owner', id);
    if (!created.ok || !created.value) throw new Error('request');
    expect(await detail()).toMatchObject({
      isHidden: false,
      latestHide: { id: created.value, action: 'hide', status: 'queued', errorCode: null },
    });
    await admin.query(
      "UPDATE cf.comment_hides SET status = 'failed', error_code = 'RATE_LIMIT' WHERE id = $1",
      [created.value],
    );
    await admin.query("UPDATE cf.comments SET is_hidden = true, status = 'hidden' WHERE id = $1", [
      id,
    ]);
    expect(await detail()).toMatchObject({
      isHidden: true,
      latestHide: { status: 'failed', errorCode: 'RATE_LIMIT' },
    });
  });
});

describe('FR-044 bổ sung: bình luận của Page, khôi phục trạng thái, hủy của Owner, đua ẩn/trả lời', () => {
  it('FR-044 bình luận do chính Page viết (is_own) → not_hideable, không tạo yêu cầu', async () => {
    const id = await comment();
    await admin.query('UPDATE cf.comments SET is_own = true WHERE id = $1', [id]);
    expect(await request('owner', id)).toEqual({ ok: false, reason: 'not_hideable' });
    expect(await hidesOf(id)).toHaveLength(0);
  });

  it('FR-044 bỏ ẩn lấy trạng thái từ dòng done MỚI NHẤT (hide hoặc unhide); đã có external_reply_id thì ép replied', async () => {
    const previousOfUnhide = async (id: string) => {
      const r = (await request('owner', id, false)) as { ok: true; value: string };
      return (
        await admin.query('SELECT previous_status FROM cf.comment_hides WHERE id = $1', [r.value])
      ).rows[0].previous_status as string;
    };
    const id = await comment({ status: 'needs_human' });
    await admin.query(
      `INSERT INTO cf.comment_hides (workspace_id, channel_id, comment_id, action, status, previous_status, created_at)
       VALUES ($1, $2, $3, 'hide', 'done', 'needs_human', now() - interval '3 minutes'),
              ($1, $2, $3, 'unhide', 'done', 'skipped', now() - interval '1 minute')`,
      [ws, channelOk, id],
    );
    await admin.query("UPDATE cf.comments SET status = 'hidden', is_hidden = true WHERE id = $1", [
      id,
    ]);
    expect(await previousOfUnhide(id)).toBe('skipped');

    const replied = await comment({ status: 'needs_human', replyId: 'fb-reply-9' });
    await admin.query(
      `INSERT INTO cf.comment_hides (workspace_id, channel_id, comment_id, action, status, previous_status)
       VALUES ($1, $2, $3, 'hide', 'done', 'needs_human')`,
      [ws, channelOk, replied],
    );
    await admin.query("UPDATE cf.comments SET status = 'hidden', is_hidden = true WHERE id = $1", [
      replied,
    ]);
    expect(await previousOfUnhide(replied)).toBe('replied');
  });

  it('FR-044 Owner hủy được yêu cầu queued của người khác; Staff chỉ hủy của mình hoặc yêu cầu requested_by NULL; hủy ghi action_logs', async () => {
    const mine = await comment();
    const a = await request('staff', mine);
    if (!a.ok || !a.value) throw new Error('request');
    const ownerRequest = await comment();
    const b = await request('owner', ownerRequest);
    if (!b.ok || !b.value) throw new Error('request');
    expect(await as('staff', (tx) => cancelCommentHide(tx, b.value as string))).toEqual({
      ok: true,
      value: false,
    });
    expect(await as('owner', (tx) => cancelCommentHide(tx, a.value as string))).toEqual({
      ok: true,
      value: true,
    });
    const logs = (
      await admin.query(
        "SELECT actor_id FROM core.action_logs WHERE target_id = $1 AND action = 'comment.hide_cancelled'",
        [mine],
      )
    ).rows;
    expect(logs).toHaveLength(1);
    expect(logs[0].actor_id).toBe(ids.owner);
    await admin.query('UPDATE cf.comment_hides SET requested_by = NULL WHERE id = $1', [b.value]);
    expect(await as('staff', (tx) => cancelCommentHide(tx, b.value as string))).toEqual({
      ok: true,
      value: true,
    });
    const stuck = await comment();
    const c = await request('staff', stuck);
    if (!c.ok || !c.value) throw new Error('request');
    await admin.query("UPDATE cf.comment_hides SET status = 'sending' WHERE id = $1", [c.value]);
    expect(await as('owner', (tx) => cancelCommentHide(tx, c.value as string))).toEqual({
      ok: true,
      value: false,
    });
  });

  it('FR-044 ẩn và trả lời song song cho cùng bình luận → đúng một bên thắng', async () => {
    for (let round = 0; round < 3; round += 1) {
      const id = await comment();
      const [h, r] = await Promise.all([
        request('owner', id),
        as('staff', (tx) => requestCommentReply(tx, { commentId: id, text: 'Dạ ạ' })),
      ]);
      const hides = await hidesOf(id);
      const replies = (
        await admin.query('SELECT 1 FROM cf.comment_replies WHERE comment_id = $1', [id])
      ).rows;
      expect(hides.length + replies.length).toBe(1);
      expect(h.ok && !!h.value).toBe(hides.length === 1);
      expect(r.ok).toBe(replies.length === 1);
    }
  });
});
