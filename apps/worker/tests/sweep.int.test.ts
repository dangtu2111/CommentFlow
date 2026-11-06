import { randomUUID } from 'node:crypto';
import { createConnectorRegistry, type NormalizedComment, PlatformError } from '@flow/connectors';
import { createFakeConnector } from '@flow/connectors/testing';
import { createDb, type FlowDb, requestCommentHide, requestCommentReply } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_HIDE_ATTEMPTS } from '../src/jobs/hide';
import { MAX_SEND_ATTEMPTS } from '../src/jobs/send';
import { runSweep } from '../src/jobs/sweep';

/**
 * SEND-SWEEP + HIDE-SWEEP (ADR 008/009, migration 0031): job quét tìm yêu cầu kẹt bằng hàm DB `cf.list_stuck_outbox` rồi xử lý
 * lại QUA `processSendJob`/`processHideJob` (kiểm lại R1–R3/H1–H3, kiểm trước khi gửi lại). Connector giả, không gọi mạng.
 * Dòng kẹt được làm cũ 10 năm để luôn nằm đầu lô quét (dòng còn sót của test khác không chen chỗ).
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let staff: string;
const quiet = { info: () => {}, error: () => {} };
const TEN_YEARS = 10 * 365 * 24 * 3600;

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 6 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 3 });
  ws = randomUUID();
  staff = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop sweep',
    `shop-${ws}`,
  ]);
  await admin.query('INSERT INTO core.users (id, email, name) VALUES ($1, $2, $3)', [
    staff,
    `${staff}@example.test`,
    'Nhân viên',
  ]);
  await admin.query(
    "INSERT INTO core.members (workspace_id, user_id, role, status) VALUES ($1, $2, 'staff', 'active')",
    [ws, staff],
  );
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

type Fixture = {
  channelId: string;
  pageId: string;
  commentId: string;
  commentExternalId: string;
  requestId: string;
};

async function seedComment(commentStatus: string, isHidden = false) {
  const pageId = `page-${randomUUID()}`;
  const channel = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name, status) VALUES ($1, 'facebook', $2, 'Page', 'connected') RETURNING id",
    [ws, pageId],
  );
  const channelId = channel.rows[0].id as string;
  const post = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
    [ws, channelId, `post-${randomUUID()}`],
  );
  const commentExternalId = `cm-${randomUUID()}`;
  const comment = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, created_time, status, is_hidden)
     VALUES ($1, $2, $3, $4, 'u1', 'Khách', 'Giá bao nhiêu?', now(), $5, $6) RETURNING id`,
    [ws, channelId, post.rows[0].id, commentExternalId, commentStatus, isHidden],
  );
  return { channelId, pageId, commentExternalId, commentId: comment.rows[0].id as string };
}

/** Yêu cầu gửi kẹt: tạo qua hàm DEFINER thật rồi làm cũ + đặt trạng thái. */
async function stuckReply(
  status: 'queued' | 'sending',
  text = 'Dạ còn size M ạ.',
): Promise<Fixture> {
  const base = await seedComment('pending_review');
  const requestId = await db.withActor(ws, staff, (tx) =>
    requestCommentReply(tx, { commentId: base.commentId, text }),
  );
  await admin.query(
    'UPDATE cf.comment_replies SET status = $2, updated_at = now() - make_interval(secs => $3) WHERE id = $1',
    [requestId, status, TEN_YEARS],
  );
  return { ...base, requestId };
}

async function stuckHide(
  status: 'queued' | 'sending',
  options: { hide?: boolean } = {},
): Promise<Fixture> {
  const hide = options.hide ?? true;
  const base = await seedComment(hide ? 'needs_human' : 'hidden', !hide);
  const requestId = await db.withActor(ws, staff, (tx) =>
    requestCommentHide(tx, { commentId: base.commentId, hide }),
  );
  if (!requestId) throw new Error('request hide');
  await admin.query(
    'UPDATE cf.comment_hides SET status = $2, updated_at = now() - make_interval(secs => $3) WHERE id = $1',
    [requestId, status, TEN_YEARS],
  );
  return { ...base, requestId };
}

function connector(existing: (pageId: string) => NormalizedComment[] = () => []) {
  const fake = createFakeConnector('facebook');
  const replies: { commentExternalId: string }[] = [];
  const hides: { commentExternalId: string; hidden: boolean }[] = [];
  // Thứ tự gọi theo khóa `fetch:<pageId>` / `reply:<mã bình luận>` (dòng sót của test khác không làm nhiễu).
  const order: string[] = [];
  const impl = {
    ...fake,
    async reply(_c: unknown, commentExternalId: string) {
      order.push(`reply:${commentExternalId}`);
      replies.push({ commentExternalId });
      return { externalId: `fb-reply-${replies.length}` };
    },
    async fetchComments(channel: { externalId: string }) {
      order.push(`fetch:${channel.externalId}`);
      return existing(channel.externalId);
    },
    async setHidden(_c: unknown, commentExternalId: string, hidden: boolean) {
      hides.push({ commentExternalId, hidden });
    },
  };
  return { impl, replies, hides, order, registry: createConnectorRegistry([impl]) };
}

const sweep = (registry: ReturnType<typeof createConnectorRegistry>) =>
  runSweep({ db, registry, logger: quiet });
const replyRow = async (id: string) =>
  (await admin.query('SELECT * FROM cf.comment_replies WHERE id = $1', [id])).rows[0];
const hideRow = async (id: string) =>
  (await admin.query('SELECT * FROM cf.comment_hides WHERE id = $1', [id])).rows[0];
const commentRow = async (id: string) =>
  (
    await admin.query(
      'SELECT status, is_hidden, external_reply_id FROM cf.comments WHERE id = $1',
      [id],
    )
  ).rows[0];
const callsFor = <T extends { commentExternalId: string }>(calls: T[], fx: Fixture) =>
  calls.filter((c) => c.commentExternalId === fx.commentExternalId);

describe('SEND-SWEEP: yêu cầu gửi kẹt', () => {
  it('`queued` bị bỏ quên → quét gửi ĐÚNG MỘT LẦN qua processSendJob (sent + comment replied)', async () => {
    const fx = await stuckReply('queued');
    const { registry, replies } = connector();
    const result = await sweep(registry);
    expect(result.send).toBeGreaterThanOrEqual(1);
    expect(callsFor(replies, fx)).toHaveLength(1);
    expect(await replyRow(fx.requestId)).toMatchObject({ status: 'sent', attempts: 1 });
    expect(await commentRow(fx.commentId)).toMatchObject({ status: 'replied' });
  });

  it('quét lại lần hai không gửi thêm (yêu cầu đã `sent`, không còn kẹt)', async () => {
    const fx = await stuckReply('queued');
    const { registry, replies } = connector();
    await sweep(registry);
    await sweep(registry);
    expect(callsFor(replies, fx)).toHaveLength(1);
  });

  it('`queued` kẹt nhưng bình luận đã bị ẩn (R2) → HỦY, KHÔNG gọi connector', async () => {
    const fx = await stuckReply('queued');
    await admin.query('UPDATE cf.comments SET is_hidden = true WHERE id = $1', [fx.commentId]);
    const { registry, replies } = connector();
    await sweep(registry);
    expect(callsFor(replies, fx)).toHaveLength(0);
    expect(await replyRow(fx.requestId)).toMatchObject({
      status: 'cancelled',
      error_code: 'recheck:R2',
    });
  });

  it('`queued` kẹt nhưng kênh đã hết kết nối (R3) → thất bại recheck:R3, KHÔNG gọi connector', async () => {
    const fx = await stuckReply('queued');
    await admin.query("UPDATE cf.channels SET status = 'expired' WHERE id = $1", [fx.channelId]);
    const { registry, replies } = connector();
    await sweep(registry);
    expect(callsFor(replies, fx)).toHaveLength(0);
    expect(await replyRow(fx.requestId)).toMatchObject({
      status: 'failed',
      error_code: 'recheck:R3',
    });
    expect(await commentRow(fx.commentId)).toMatchObject({ status: 'send_failed' });
  });

  it('`sending` hết thuê, lần trước ĐÃ đăng nhưng mất kết quả → kiểm trước, ghi `sent`, KHÔNG gửi lần hai', async () => {
    const fx = await stuckReply('sending', 'Dạ còn size M ạ.');
    const { registry, replies, order } = connector(() => [
      {
        externalId: 'fb-existing-reply',
        postExternalId: 'p',
        parentExternalId: fx.commentExternalId,
        authorExternalId: fx.pageId,
        text: 'Dạ còn size M ạ.',
        createdAt: new Date(),
        isFromPage: true,
      },
    ]);
    await sweep(registry);
    expect(callsFor(replies, fx)).toHaveLength(0);
    expect(order).toContain(`fetch:${fx.pageId}`);
    expect(await replyRow(fx.requestId)).toMatchObject({
      status: 'sent',
      external_reply_id: 'fb-existing-reply',
    });
    expect(await commentRow(fx.commentId)).toMatchObject({
      status: 'replied',
      external_reply_id: 'fb-existing-reply',
    });
  });

  it('`sending` hết thuê, chưa có bản đăng → KIỂM TRƯỚC (fetchComments) rồi mới gửi', async () => {
    const fx = await stuckReply('sending');
    const { registry, replies, order } = connector();
    await sweep(registry);
    expect(callsFor(replies, fx)).toHaveLength(1);
    const fetched = order.indexOf(`fetch:${fx.pageId}`);
    expect(fetched).toBeGreaterThanOrEqual(0);
    expect(fetched).toBeLessThan(order.indexOf(`reply:${fx.commentExternalId}`));
    expect(await replyRow(fx.requestId)).toMatchObject({ status: 'sent' });
  });

  it('đã đủ số lần gọi nền tảng (attempts = MAX) → ghi failed UNKNOWN, KHÔNG gọi connector (không thử vô hạn)', async () => {
    const fx = await stuckReply('sending');
    await admin.query('UPDATE cf.comment_replies SET attempts = $2 WHERE id = $1', [
      fx.requestId,
      MAX_SEND_ATTEMPTS,
    ]);
    const { registry, replies } = connector();
    await sweep(registry);
    expect(callsFor(replies, fx)).toHaveLength(0);
    expect(await replyRow(fx.requestId)).toMatchObject({ status: 'failed', error_code: 'UNKNOWN' });
    expect(await commentRow(fx.commentId)).toMatchObject({ status: 'send_failed' });
  });

  it('yêu cầu CÒN MỚI (queued vừa tạo, sending còn thuê) không bị quét', async () => {
    const base = await seedComment('pending_review');
    const requestId = await db.withActor(ws, staff, (tx) =>
      requestCommentReply(tx, { commentId: base.commentId, text: 'Dạ còn ạ.' }),
    );
    const { registry, replies } = connector();
    await sweep(registry);
    expect(callsFor(replies, { ...base, requestId })).toHaveLength(0);
    expect(await replyRow(requestId)).toMatchObject({ status: 'queued', attempts: 0 });
  });

  it('connector báo lỗi vĩnh viễn → ghi failed như đường job thường (không treo, không ném ra)', async () => {
    const fx = await stuckReply('queued');
    const { impl } = connector();
    const failing = createConnectorRegistry([
      {
        ...impl,
        async reply() {
          throw new PlatformError('PERMISSION', { message: 'EAAG-token-bi-mat' });
        },
        mapError: (error: unknown) => error as PlatformError,
      },
    ]);
    await expect(sweep(failing)).resolves.toBeDefined();
    expect(await replyRow(fx.requestId)).toMatchObject({
      status: 'failed',
      error_code: 'PERMISSION',
    });
  });
});

describe('HIDE-SWEEP: yêu cầu ẩn kẹt', () => {
  it('`queued` bị bỏ quên → quét ẩn qua processHideJob (done + is_hidden)', async () => {
    const fx = await stuckHide('queued');
    const { registry, hides } = connector();
    const result = await sweep(registry);
    expect(result.hide).toBeGreaterThanOrEqual(1);
    expect(callsFor(hides, fx)).toEqual([
      { commentExternalId: fx.commentExternalId, hidden: true },
    ]);
    expect(await hideRow(fx.requestId)).toMatchObject({ status: 'done', attempts: 1 });
    expect(await commentRow(fx.commentId)).toMatchObject({ status: 'hidden', is_hidden: true });
  });

  it('`sending` hết thuê → gọi lại (ẩn idempotent) rồi ghi done', async () => {
    const fx = await stuckHide('sending');
    const { registry, hides } = connector();
    await sweep(registry);
    expect(callsFor(hides, fx)).toHaveLength(1);
    expect(await hideRow(fx.requestId)).toMatchObject({ status: 'done' });
  });

  it('bình luận đã ở trạng thái đích (H2) → done, KHÔNG gọi nền tảng', async () => {
    const fx = await stuckHide('queued');
    await admin.query("UPDATE cf.comments SET is_hidden = true, status = 'hidden' WHERE id = $1", [
      fx.commentId,
    ]);
    const { registry, hides } = connector();
    await sweep(registry);
    expect(callsFor(hides, fx)).toHaveLength(0);
    expect(await hideRow(fx.requestId)).toMatchObject({ status: 'done' });
  });

  it('khách đã xóa bình luận (H1) → hủy recheck:H1, KHÔNG gọi nền tảng', async () => {
    const fx = await stuckHide('queued');
    await admin.query('UPDATE cf.comments SET deleted_at = now() WHERE id = $1', [fx.commentId]);
    const { registry, hides } = connector();
    await sweep(registry);
    expect(callsFor(hides, fx)).toHaveLength(0);
    expect(await hideRow(fx.requestId)).toMatchObject({
      status: 'cancelled',
      error_code: 'recheck:H1',
    });
  });

  it('kênh hết kết nối (H3) → thất bại recheck:H3, KHÔNG gọi nền tảng', async () => {
    const fx = await stuckHide('queued');
    await admin.query("UPDATE cf.channels SET status = 'expired' WHERE id = $1", [fx.channelId]);
    const { registry, hides } = connector();
    await sweep(registry);
    expect(callsFor(hides, fx)).toHaveLength(0);
    expect(await hideRow(fx.requestId)).toMatchObject({
      status: 'failed',
      error_code: 'recheck:H3',
    });
  });

  it('đã đủ số lần gọi (attempts = MAX) → failed UNKNOWN, KHÔNG gọi nền tảng', async () => {
    const fx = await stuckHide('sending');
    await admin.query('UPDATE cf.comment_hides SET attempts = $2 WHERE id = $1', [
      fx.requestId,
      MAX_HIDE_ATTEMPTS,
    ]);
    const { registry, hides } = connector();
    await sweep(registry);
    expect(callsFor(hides, fx)).toHaveLength(0);
    expect(await hideRow(fx.requestId)).toMatchObject({ status: 'failed', error_code: 'UNKNOWN' });
  });

  it('bỏ ẩn (`unhide`) kẹt → quét gọi setHidden(false) và khôi phục trạng thái', async () => {
    const fx = await stuckHide('queued', { hide: false });
    const { registry, hides } = connector();
    await sweep(registry);
    expect(callsFor(hides, fx)).toEqual([
      { commentExternalId: fx.commentExternalId, hidden: false },
    ]);
    expect(await commentRow(fx.commentId)).toMatchObject({ is_hidden: false });
  });
});
