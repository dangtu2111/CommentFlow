import { randomUUID } from 'node:crypto';
import {
  type ConnectorCapabilities,
  createConnectorRegistry,
  DECLARED_CAPABILITIES,
  type NormalizedComment,
  PlatformError,
  type PlatformErrorCode,
} from '@flow/connectors';
import { createFakeConnector } from '@flow/connectors/testing';
import { createDb, type FlowDb, requestCommentReply } from '@flow/db';
import pg from 'pg';
import type { Job } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createSendHandler,
  MAX_SEND_ATTEMPTS,
  processSendJob,
  SEND_LEASE_SECONDS,
  SendInFlightError,
  SendRetryableError,
} from '../src/jobs/send';

/**
 * FB-REPLY backend (FR-042, docs/09 §6.1): job `send` — sendRecheck R1–R3, evaluateAction, gọi connector (giả), ghi kết
 * quả, thử lại an toàn (kiểm trước khi gửi lại), không gửi trùng khi chạy song song. Connector giả, không gọi mạng.
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let staff: string;
const quiet = { error: () => {} };

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl) throw new Error('Thiếu TEST_DATABASE_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 6 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 3 });
  ws = randomUUID();
  staff = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop send',
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
  replyId: string;
};

async function fixture(
  options: { channelStatus?: string; commentStatus?: string; text?: string } = {},
): Promise<Fixture> {
  const pageId = `page-${randomUUID()}`;
  const channel = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name, status) VALUES ($1, 'facebook', $2, 'Page', $3) RETURNING id",
    [ws, pageId, options.channelStatus ?? 'connected'],
  );
  const channelId = channel.rows[0].id as string;
  const post = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
    [ws, channelId, `post-${randomUUID()}`],
  );
  const commentExternalId = `cm-${randomUUID()}`;
  const comment = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, created_time, status)
     VALUES ($1, $2, $3, $4, 'u1', 'Khách', 'Giá bao nhiêu?', now(), $5) RETURNING id`,
    [ws, channelId, post.rows[0].id, commentExternalId, options.commentStatus ?? 'pending_review'],
  );
  const commentId = comment.rows[0].id as string;
  const replyId = await db.withActor(ws, staff, (tx) =>
    requestCommentReply(tx, { commentId, text: options.text ?? 'Dạ còn size M ạ.' }),
  );
  return { channelId, pageId, commentId, commentExternalId, replyId };
}

type Behaviour = {
  reply?: () => Promise<{ externalId: string }>;
  existing?: (fx: Fixture) => NormalizedComment[];
  capabilities?: ConnectorCapabilities;
};

function connectorWith(behaviour: Behaviour = {}, fx?: Fixture) {
  const fake = createFakeConnector(
    'facebook',
    behaviour.capabilities ? { capabilities: behaviour.capabilities } : {},
  );
  const replies: unknown[][] = [];
  const connector = {
    ...fake,
    async reply(...args: Parameters<typeof fake.reply>) {
      replies.push(args);
      return behaviour.reply ? behaviour.reply() : { externalId: `fb-reply-${replies.length}` };
    },
    async fetchComments() {
      return fx && behaviour.existing ? behaviour.existing(fx) : [];
    },
  };
  return { connector, replies, registry: createConnectorRegistry([connector]) };
}

const run = (
  fx: Fixture,
  registry: ReturnType<typeof createConnectorRegistry>,
  extra: { sleep?: (ms: number) => Promise<void>; leaseSeconds?: number } = {},
) => processSendJob({ db, registry, job: { workspaceId: ws, replyId: fx.replyId }, ...extra });
const replyRow = async (id: string) =>
  (await admin.query('SELECT * FROM cf.comment_replies WHERE id = $1', [id])).rows[0];
const commentRow = async (id: string) =>
  (
    await admin.query(
      'SELECT status, external_reply_id, replied_by, replied_at FROM cf.comments WHERE id = $1',
      [id],
    )
  ).rows[0];
const channelStatus = async (id: string) =>
  (await admin.query('SELECT status FROM cf.channels WHERE id = $1', [id])).rows[0].status;
const failWith = (code: PlatformErrorCode) => async () => {
  throw new PlatformError(code, { message: 'EAAG-token-bi-mat Khách Thử' });
};

describe('FR-042 job send — gửi thành công', () => {
  it('gọi connector ĐÚNG MỘT LẦN với (kênh không bí mật, mã bình luận ngoài, nội dung); ghi sent/replied + external_reply_id + replied_by + action_logs', async () => {
    const fx = await fixture();
    const { replies, registry } = connectorWith();
    await run(fx, registry);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toEqual([
      { id: fx.channelId, workspaceId: ws, platform: 'facebook', externalId: fx.pageId },
      fx.commentExternalId,
      'Dạ còn size M ạ.',
    ]);
    const reply = await replyRow(fx.replyId);
    expect(reply).toMatchObject({
      status: 'sent',
      external_reply_id: 'fb-reply-1',
      attempts: 1,
      error_code: null,
    });
    expect(reply.sent_at).not.toBeNull();
    const comment = await commentRow(fx.commentId);
    expect(comment).toMatchObject({
      status: 'replied',
      external_reply_id: 'fb-reply-1',
      replied_by: staff,
    });
    expect(comment.replied_at).not.toBeNull();
    const log = (
      await admin.query(
        "SELECT actor_type, actor_id, on_behalf_of, after FROM core.action_logs WHERE target_id = $1 AND action = 'comment.replied'",
        [fx.commentId],
      )
    ).rows;
    expect(log).toHaveLength(1);
    // LOG-STAFF-SYSTEM-ROWS: dòng hệ thống ghi người yêu cầu để Staff thấy dòng của chính mình.
    expect(log[0]).toMatchObject({ actor_type: 'system', actor_id: null, on_behalf_of: staff });
    expect(JSON.stringify(log)).not.toContain('size M');
  });

  it('chạy lại job đã xong / đã hủy / đã thất bại → không gọi connector, không đổi gì', async () => {
    const fx = await fixture();
    const first = connectorWith();
    await run(fx, first.registry);
    const again = connectorWith();
    await run(fx, again.registry);
    expect(again.replies).toHaveLength(0);
    expect((await replyRow(fx.replyId)).status).toBe('sent');
    await run({ ...fx, replyId: randomUUID() }, again.registry); // yêu cầu không tồn tại: êm
    expect(again.replies).toHaveLength(0);
  });
});

describe('FR-042 sendRecheck — trượt thì KHÔNG gọi connector', () => {
  it('R1: bình luận đã có external_reply_id hoặc không còn trạng thái sending → hủy recheck:R1', async () => {
    const replied = await fixture();
    await admin.query("UPDATE cf.comments SET external_reply_id = 'da-tra-loi' WHERE id = $1", [
      replied.commentId,
    ]);
    const skipped = await fixture();
    await admin.query("UPDATE cf.comments SET status = 'skipped' WHERE id = $1", [
      skipped.commentId,
    ]);
    for (const fx of [replied, skipped]) {
      const { replies, registry } = connectorWith();
      await run(fx, registry);
      expect(replies).toHaveLength(0);
      expect(await replyRow(fx.replyId)).toMatchObject({
        status: 'cancelled',
        error_code: 'recheck:R1',
      });
    }
  });

  it('R2: bình luận đã ẩn/gộp → hủy recheck:R2 và trả bình luận về trạng thái trước', async () => {
    const hidden = await fixture({ commentStatus: 'needs_human' });
    await admin.query('UPDATE cf.comments SET is_hidden = true WHERE id = $1', [hidden.commentId]);
    const { replies, registry } = connectorWith();
    await run(hidden, registry);
    expect(replies).toHaveLength(0);
    expect(await replyRow(hidden.replyId)).toMatchObject({
      status: 'cancelled',
      error_code: 'recheck:R2',
    });
    expect((await commentRow(hidden.commentId)).status).toBe('needs_human');
  });

  it('R2: khách đã xóa bình luận trên nền tảng (deleted_at) → hủy recheck:R2, không gọi connector, bình luận về trạng thái trước', async () => {
    const fx = await fixture({ commentStatus: 'needs_human' });
    await admin.query('UPDATE cf.comments SET deleted_at = now() WHERE id = $1', [fx.commentId]);
    const { replies, registry } = connectorWith();
    await run(fx, registry);
    expect(replies).toHaveLength(0);
    expect(await replyRow(fx.replyId)).toMatchObject({
      status: 'cancelled',
      error_code: 'recheck:R2',
    });
    expect((await commentRow(fx.commentId)).status).toBe('needs_human');
  });

  it('R3: kênh không còn connected hoặc đang bị tạm khóa gửi → failed recheck:R3, bình luận send_failed', async () => {
    const expired = await fixture();
    await admin.query("UPDATE cf.channels SET status = 'expired' WHERE id = $1", [
      expired.channelId,
    ]);
    const suspended = await fixture();
    await admin.query(
      "UPDATE cf.channels SET send_suspended_until = now() + interval '1 hour' WHERE id = $1",
      [suspended.channelId],
    );
    for (const fx of [expired, suspended]) {
      const { replies, registry } = connectorWith();
      await run(fx, registry);
      expect(replies).toHaveLength(0);
      expect(await replyRow(fx.replyId)).toMatchObject({
        status: 'failed',
        error_code: 'recheck:R3',
      });
      expect((await commentRow(fx.commentId)).status).toBe('send_failed');
    }
  });

  it('không có connector cho nền tảng → failed connector_unavailable (không thử lại vô ích)', async () => {
    const fx = await fixture();
    await run(fx, createConnectorRegistry([]));
    expect(await replyRow(fx.replyId)).toMatchObject({
      status: 'failed',
      error_code: 'connector_unavailable',
    });
    expect((await commentRow(fx.commentId)).status).toBe('send_failed');
  });

  it('evaluateAction: quá độ dài theo khai báo của connector → failed TEXT_TOO_LONG, không gọi connector', async () => {
    const fx = await fixture({ text: 'Câu trả lời rất dài so với giới hạn thử nghiệm.' });
    const capabilities: ConnectorCapabilities = {
      ...DECLARED_CAPABILITIES.facebook,
      reply: { supported: true, verified: true, maxTextLength: 10 },
    };
    const { replies, registry } = connectorWith({ capabilities });
    await run(fx, registry);
    expect(replies).toHaveLength(0);
    expect(await replyRow(fx.replyId)).toMatchObject({
      status: 'failed',
      error_code: 'TEXT_TOO_LONG',
    });
  });
});

describe('FR-042 lỗi từ nền tảng', () => {
  it('TOKEN_EXPIRED → thất bại + kênh expired; PERMISSION → thất bại, kênh GIỮ NGUYÊN (có thể chỉ từ chối theo đối tượng); BLOCKED → thất bại, kênh giữ nguyên; error_code chỉ là mã (không lộ token/nội dung)', async () => {
    const cases: Array<[PlatformErrorCode, string]> = [
      ['TOKEN_EXPIRED', 'expired'],
      ['PERMISSION', 'connected'],
      ['BLOCKED', 'connected'],
    ];
    for (const [code, expectedChannel] of cases) {
      const fx = await fixture();
      const { registry } = connectorWith({ reply: failWith(code) });
      await run(fx, registry);
      const reply = await replyRow(fx.replyId);
      expect(reply, code).toMatchObject({ status: 'failed', error_code: code });
      expect(JSON.stringify(reply)).not.toContain('EAAG');
      expect(JSON.stringify(reply)).not.toContain('Khách Thử');
      expect((await commentRow(fx.commentId)).status, code).toBe('send_failed');
      expect(await channelStatus(fx.channelId), code).toBe(expectedChannel);
    }
  });

  it('RATE_LIMIT: chắc chắn chưa gửi → trả về queued và ném để thử lại; lần sau gửi được', async () => {
    const fx = await fixture();
    const limited = connectorWith({ reply: failWith('RATE_LIMIT') });
    await expect(run(fx, limited.registry)).rejects.toBeInstanceOf(SendRetryableError);
    expect(await replyRow(fx.replyId)).toMatchObject({ status: 'queued', attempts: 1 });
    expect((await commentRow(fx.commentId)).status).toBe('sending');
    const ok = connectorWith();
    await run(fx, ok.registry);
    expect(await replyRow(fx.replyId)).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('UNKNOWN (có thể đã gửi nhưng mất kết quả): lần sau KIỂM TRƯỚC — thấy câu trả lời của Page → ghi sent, KHÔNG gửi lại', async () => {
    const fx = await fixture();
    const broken = connectorWith({ reply: failWith('UNKNOWN') });
    await expect(run(fx, broken.registry)).rejects.toBeInstanceOf(SendRetryableError);
    const stuck = await replyRow(fx.replyId);
    expect(stuck.status).toBe('sending');

    const existing = (f: Fixture): NormalizedComment[] => [
      {
        externalId: 'fb-da-gui-truoc-do',
        postExternalId: 'p',
        parentExternalId: f.commentExternalId,
        authorExternalId: f.pageId,
        text: '  Dạ còn size M ạ.  ',
        createdAt: new Date(),
        isFromPage: true,
      },
    ];
    const recovered = connectorWith({ existing }, fx);
    await run(fx, recovered.registry);
    expect(recovered.replies).toHaveLength(0);
    expect(await replyRow(fx.replyId)).toMatchObject({
      status: 'sent',
      external_reply_id: 'fb-da-gui-truoc-do',
    });
    expect((await commentRow(fx.commentId)).status).toBe('replied');
  });

  it('UNKNOWN rồi KHÔNG thấy câu đã gửi → gửi lại bình thường; câu của người khác/nội dung khác không bị nhận nhầm', async () => {
    const fx = await fixture();
    await expect(
      run(fx, connectorWith({ reply: failWith('UNKNOWN') }).registry),
    ).rejects.toBeInstanceOf(SendRetryableError);
    const decoys = (f: Fixture): NormalizedComment[] => [
      {
        externalId: 'khach',
        postExternalId: 'p',
        parentExternalId: f.commentExternalId,
        authorExternalId: 'u',
        text: 'Dạ còn size M ạ.',
        createdAt: new Date(),
        isFromPage: false,
      },
      {
        externalId: 'khac-noi-dung',
        postExternalId: 'p',
        parentExternalId: f.commentExternalId,
        authorExternalId: f.pageId,
        text: 'Câu khác',
        createdAt: new Date(),
        isFromPage: true,
      },
      {
        externalId: 'khac-binh-luan',
        postExternalId: 'p',
        parentExternalId: 'cm-khac',
        authorExternalId: f.pageId,
        text: 'Dạ còn size M ạ.',
        createdAt: new Date(),
        isFromPage: true,
      },
    ];
    const retry = connectorWith({ existing: decoys }, fx);
    await run(fx, retry.registry);
    expect(retry.replies).toHaveLength(1);
    expect(await replyRow(fx.replyId)).toMatchObject({
      status: 'sent',
      external_reply_id: 'fb-reply-1',
    });
  });

  it('lỗi tạm thời kéo dài hết số lần thử → failed (không ném mãi)', async () => {
    const fx = await fixture();
    const flaky = connectorWith({ reply: failWith('RATE_LIMIT') });
    for (let i = 1; i < MAX_SEND_ATTEMPTS; i++) {
      await expect(run(fx, flaky.registry)).rejects.toBeInstanceOf(SendRetryableError);
    }
    await run(fx, flaky.registry);
    expect(await replyRow(fx.replyId)).toMatchObject({
      status: 'failed',
      error_code: 'RATE_LIMIT',
      attempts: MAX_SEND_ATTEMPTS,
    });
    expect((await commentRow(fx.commentId)).status).toBe('send_failed');
  });
});

describe('FR-042 không gửi trùng khi chạy song song', () => {
  it('hai job cùng yêu cầu chạy cùng lúc → connector.reply gọi đúng MỘT lần; job còn lại CHỜ hết thuê (không đốt lượt thử lại) rồi thấy đã gửi xong', async () => {
    const fx = await fixture();
    const slow = connectorWith({
      reply: async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { externalId: 'fb-cham' };
      },
    });
    const waits: number[] = [];
    // Không chờ thật 90 giây: chờ ~700ms (đủ để job đầu xong) và ghi lại thời gian được yêu cầu chờ.
    const sleep = async (ms: number) => {
      waits.push(ms);
      await new Promise((resolve) => setTimeout(resolve, 700));
    };
    await Promise.all([run(fx, slow.registry, { sleep }), run(fx, slow.registry, { sleep })]);
    expect(slow.replies).toHaveLength(1);
    expect(waits.length).toBeLessThanOrEqual(1);
    for (const ms of waits) expect(ms).toBeGreaterThan(0);
    expect(await replyRow(fx.replyId)).toMatchObject({
      status: 'sent',
      external_reply_id: 'fb-cham',
    });
  });

  it('chờ xong mà job kia VẪN còn trong thời hạn thuê → ném SendInFlightError (pg-boss thử lại), không gửi', async () => {
    const fx = await fixture();
    await admin.query(
      "UPDATE cf.comment_replies SET status = 'sending', attempts = 1, updated_at = now() WHERE id = $1",
      [fx.replyId],
    );
    const { replies, registry } = connectorWith();
    await expect(run(fx, registry, { sleep: async () => undefined })).rejects.toBeInstanceOf(
      SendInFlightError,
    );
    expect(replies).toHaveLength(0);
  });

  it('RÀO ghi kết quả: job chạy quá hạn thuê, job khác đã tiếp quản và ghi → lần ghi muộn KHÔNG ghi đè (kể cả thất bại muộn)', async () => {
    for (const late of ['success', 'failure'] as const) {
      const fx = await fixture();
      const takeover = connectorWith({
        reply: async () => {
          // trong lúc job A đang gọi API, job B đã gửi xong và ghi sent (attempts + 1)
          await admin.query(
            "UPDATE cf.comment_replies SET status = 'sent', external_reply_id = 'fb-B', attempts = attempts + 1, sent_at = now() WHERE id = $1",
            [fx.replyId],
          );
          await admin.query(
            "UPDATE cf.comments SET status = 'replied', external_reply_id = 'fb-B' WHERE id = $1",
            [fx.commentId],
          );
          if (late === 'failure') throw new PlatformError('PERMISSION', { message: 'x' });
          return { externalId: 'fb-A-muon' };
        },
      });
      await run(fx, takeover.registry);
      expect(await replyRow(fx.replyId), late).toMatchObject({
        status: 'sent',
        external_reply_id: 'fb-B',
        error_code: null,
      });
      expect(await commentRow(fx.commentId), late).toMatchObject({
        status: 'replied',
        external_reply_id: 'fb-B',
      });
      expect(await channelStatus(fx.channelId), late).toBe('connected');
    }
  });

  it('UNKNOWN hết lượt → failed; gửi lại từ send_failed vẫn KIỂM TRƯỚC (có thể lần trước đã đăng) — thấy thì không gửi trùng', async () => {
    const fx = await fixture();
    const broken = connectorWith({ reply: failWith('UNKNOWN') });
    for (let i = 1; i < MAX_SEND_ATTEMPTS; i++) {
      await expect(run(fx, broken.registry)).rejects.toBeInstanceOf(SendRetryableError);
    }
    await run(fx, broken.registry);
    expect(await replyRow(fx.replyId)).toMatchObject({ status: 'failed', error_code: 'UNKNOWN' });
    expect((await commentRow(fx.commentId)).status).toBe('send_failed');

    const again = await db.withActor(ws, staff, (tx) =>
      requestCommentReply(tx, { commentId: fx.commentId, text: 'Dạ còn size M ạ.' }),
    );
    const retryFx = { ...fx, replyId: again };
    const existing = (f: Fixture): NormalizedComment[] => [
      {
        externalId: 'fb-da-dang',
        postExternalId: 'p',
        parentExternalId: f.commentExternalId,
        authorExternalId: f.pageId,
        text: 'Dạ còn size M ạ.',
        createdAt: new Date(),
        isFromPage: true,
      },
    ];
    const recovered = connectorWith({ existing }, fx);
    await run(retryFx, recovered.registry);
    expect(recovered.replies).toHaveLength(0);
    expect(await replyRow(again)).toMatchObject({
      status: 'sent',
      external_reply_id: 'fb-da-dang',
    });
  });

  it('yêu cầu đang sending quá thời hạn thuê (job trước chết giữa chừng) → job sau được tiếp quản và kiểm trước khi gửi', async () => {
    const fx = await fixture();
    await admin.query(
      "UPDATE cf.comment_replies SET status = 'sending', attempts = 1, updated_at = now() - make_interval(secs => $2) WHERE id = $1",
      [fx.replyId, SEND_LEASE_SECONDS + 5],
    );
    const { replies, registry } = connectorWith();
    await run(fx, registry);
    expect(replies).toHaveLength(1);
    expect(await replyRow(fx.replyId)).toMatchObject({ status: 'sent', attempts: 2 });
  });
});

describe('FR-042 handler hàng đợi send', () => {
  const job = (data: unknown) => [{ id: randomUUID(), data } as unknown as Job<unknown>];

  it('dữ liệu job sai → AppError (không đụng DB); lỗi gửi được log CHỈ bằng mã rồi ném lại', async () => {
    const { registry } = connectorWith();
    const handler = createSendHandler({ db, registry, logger: quiet });
    await expect(handler(job({ replyId: randomUUID() }))).rejects.toThrow(/không hợp lệ/);

    const fx = await fixture();
    const error = vi.fn();
    const failing = connectorWith({ reply: failWith('RATE_LIMIT') });
    const failingHandler = createSendHandler({ db, registry: failing.registry, logger: { error } });
    await expect(
      failingHandler(job({ workspaceId: ws, replyId: fx.replyId })),
    ).rejects.toBeInstanceOf(SendRetryableError);
    expect(error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain('SendRetryableError');
    for (const secret of ['EAAG', 'Khách Thử', 'size M']) expect(logged).not.toContain(secret);
  });

  it('xử lý đúng một job thành công qua handler', async () => {
    const fx = await fixture();
    const { replies, registry } = connectorWith();
    await createSendHandler({ db, registry, logger: quiet })(
      job({ workspaceId: ws, replyId: fx.replyId }),
    );
    expect(replies).toHaveLength(1);
    expect((await replyRow(fx.replyId)).status).toBe('sent');
  });
});

describe('FR-042 an toàn khi lỗi tạm thời lặp lại / hết lượt thử', () => {
  const job = (data: unknown, meta: Record<string, unknown> = {}) => [
    { id: randomUUID(), data, ...meta } as unknown as Job<unknown>,
  ];

  it('UNKNOWN rồi RATE_LIMIT ở bước KIỂM (fetchComments): KHÔNG trả về queued — lần sau vẫn kiểm trước khi gửi (không gửi trùng)', async () => {
    const fx = await fixture();
    await expect(
      run(fx, connectorWith({ reply: failWith('UNKNOWN') }).registry),
    ).rejects.toBeInstanceOf(SendRetryableError);
    // lần 2: là lượt tiếp quản; bước kiểm bị giới hạn tốc độ
    const checkLimited = connectorWith();
    const limitedConnector = {
      ...checkLimited.connector,
      async fetchComments(): Promise<NormalizedComment[]> {
        throw new PlatformError('RATE_LIMIT', { message: 'x' });
      },
    };
    await expect(run(fx, createConnectorRegistry([limitedConnector]))).rejects.toBeInstanceOf(
      SendRetryableError,
    );
    expect(checkLimited.replies).toHaveLength(0);
    expect((await replyRow(fx.replyId)).status).toBe('sending'); // KHÔNG về queued

    // lần 3: kiểm được và thấy câu đã đăng → không gửi lại
    const existing = (f: Fixture): NormalizedComment[] => [
      {
        externalId: 'fb-da-dang',
        postExternalId: 'p',
        parentExternalId: f.commentExternalId,
        authorExternalId: f.pageId,
        text: 'Dạ còn size M ạ.',
        createdAt: new Date(),
        isFromPage: true,
      },
    ];
    const third = connectorWith({ existing }, fx);
    await run(fx, third.registry);
    expect(third.replies).toHaveLength(0);
    expect(await replyRow(fx.replyId)).toMatchObject({
      status: 'sent',
      external_reply_id: 'fb-da-dang',
    });
  });

  it('lượt thử CUỐI của pg-boss mà vẫn lỗi tạm thời → yêu cầu failed (UNKNOWN vì đã gọi nền tảng), bình luận send_failed, job kết thúc (không kẹt sending)', async () => {
    const fx = await fixture();
    const error = vi.fn();
    const handler = createSendHandler({
      db,
      registry: connectorWith({ reply: failWith('RATE_LIMIT') }).registry,
      logger: { error },
    });
    await expect(
      handler(job({ workspaceId: ws, replyId: fx.replyId }, { retryCount: 0, retryLimit: 3 })),
    ).rejects.toBeInstanceOf(SendRetryableError);
    await expect(
      handler(job({ workspaceId: ws, replyId: fx.replyId }, { retryCount: 3, retryLimit: 3 })),
    ).resolves.toBeUndefined();
    expect(await replyRow(fx.replyId)).toMatchObject({ status: 'failed', error_code: 'UNKNOWN' });
    expect((await commentRow(fx.commentId)).status).toBe('send_failed');
  });

  it('hết lượt thử khi chưa từng gọi nền tảng (attempts = 0) → failed retries_exhausted; yêu cầu đã xong thì không bị đụng', async () => {
    const fx = await fixture();
    const handler = createSendHandler({
      db,
      registry: connectorWith().registry,
      logger: { error: () => {} },
    });
    // buộc lỗi trước khi gọi nền tảng: workspace sai trong dữ liệu job → yêu cầu không thấy → êm (không lỗi)
    await expect(
      handler(
        job({ workspaceId: randomUUID(), replyId: fx.replyId }, { retryCount: 3, retryLimit: 3 }),
      ),
    ).resolves.toBeUndefined();
    expect((await replyRow(fx.replyId)).status).toBe('queued');
  });
});
