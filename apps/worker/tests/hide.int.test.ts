import { randomUUID } from 'node:crypto';
import {
  type ConnectorCapabilities,
  createConnectorRegistry,
  DECLARED_CAPABILITIES,
  PlatformError,
  type PlatformErrorCode,
} from '@flow/connectors';
import { createFakeConnector } from '@flow/connectors/testing';
import { createDb, type FlowDb, requestCommentHide } from '@flow/db';
import pg from 'pg';
import type { Job } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createHideHandler,
  HideInFlightError,
  HideRetryableError,
  MAX_HIDE_ATTEMPTS,
  processHideJob,
} from '../src/jobs/hide';

/**
 * FB-HIDE (FR-044, ADR 009): job `hide` — kiểm lại trước khi gọi (H1–H3), evaluateAction, gọi connector (giả), ghi
 * kết quả có rào, thử lại an toàn, không gọi trùng khi chạy song song, ẩn lặp lại idempotent. Không gọi mạng.
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let staff: string;
const quiet = { error: () => {} };

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
    'Shop hide',
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
  hideId: string;
};

async function fixture(
  options: { hide?: boolean; channelStatus?: string; commentStatus?: string } = {},
): Promise<Fixture> {
  const hide = options.hide ?? true;
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
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, created_time, status, is_hidden)
     VALUES ($1, $2, $3, $4, 'u1', 'Khách', 'Giá bao nhiêu?', now(), $5, $6) RETURNING id`,
    [
      ws,
      channelId,
      post.rows[0].id,
      commentExternalId,
      options.commentStatus ?? (hide ? 'needs_human' : 'hidden'),
      !hide,
    ],
  );
  const commentId = comment.rows[0].id as string;
  // Yêu cầu qua hàm DEFINER cần kênh connected; với kênh khác, tạo yêu cầu khi kênh còn connected rồi đổi sau.
  if (options.channelStatus && options.channelStatus !== 'connected') {
    await admin.query("UPDATE cf.channels SET status = 'connected' WHERE id = $1", [channelId]);
  }
  const hideId = await db.withActor(ws, staff, (tx) => requestCommentHide(tx, { commentId, hide }));
  if (!hideId) throw new Error('request hide');
  if (options.channelStatus && options.channelStatus !== 'connected') {
    await admin.query('UPDATE cf.channels SET status = $2 WHERE id = $1', [
      channelId,
      options.channelStatus,
    ]);
  }
  return { channelId, pageId, commentId, commentExternalId, hideId };
}

type Behaviour = {
  setHidden?: () => Promise<void>;
  capabilities?: ConnectorCapabilities;
  withoutSetHidden?: boolean;
};

function connectorWith(behaviour: Behaviour = {}) {
  const fake = createFakeConnector(
    'facebook',
    behaviour.capabilities ? { capabilities: behaviour.capabilities } : {},
  );
  const calls: unknown[][] = [];
  const connector = {
    ...fake,
    setHidden: behaviour.withoutSetHidden
      ? undefined
      : async (...args: unknown[]) => {
          calls.push(args);
          if (behaviour.setHidden) await behaviour.setHidden();
        },
  };
  return { connector, calls, registry: createConnectorRegistry([connector]) };
}

const run = (
  fx: Fixture,
  registry: ReturnType<typeof createConnectorRegistry>,
  extra: { sleep?: (ms: number) => Promise<void>; leaseSeconds?: number } = {},
) => processHideJob({ db, registry, job: { workspaceId: ws, hideId: fx.hideId }, ...extra });
const hideRow = async (id: string) =>
  (await admin.query('SELECT * FROM cf.comment_hides WHERE id = $1', [id])).rows[0];
const commentRow = async (id: string) =>
  (await admin.query('SELECT status, is_hidden FROM cf.comments WHERE id = $1', [id])).rows[0];
const channelStatus = async (id: string) =>
  (await admin.query('SELECT status FROM cf.channels WHERE id = $1', [id])).rows[0].status;
const failWith = (code: PlatformErrorCode) => async () => {
  throw new PlatformError(code, { message: 'EAAG-token-bi-mat Khách Thử' });
};
const noSleep = async () => {};

describe('FR-044 job hide — ẩn / bỏ ẩn thành công', () => {
  it('FR-044 ẩn: gọi setHidden ĐÚNG MỘT LẦN (kênh không bí mật, mã ngoài, true); ghi done + is_hidden/status hidden + action_logs không nội dung', async () => {
    const fx = await fixture();
    const { calls, registry } = connectorWith();
    await run(fx, registry);
    expect(calls).toEqual([
      [
        { id: fx.channelId, workspaceId: ws, platform: 'facebook', externalId: fx.pageId },
        fx.commentExternalId,
        true,
      ],
    ]);
    expect(await commentRow(fx.commentId)).toEqual({ status: 'hidden', is_hidden: true });
    expect(await hideRow(fx.hideId)).toMatchObject({
      status: 'done',
      error_code: null,
      attempts: 1,
    });
    expect((await hideRow(fx.hideId)).done_at).not.toBeNull();
    const log = (
      await admin.query(
        "SELECT actor_type, on_behalf_of, after::text AS after FROM core.action_logs WHERE target_id = $1 AND action = 'comment.hidden'",
        [fx.commentId],
      )
    ).rows;
    expect(log).toHaveLength(1);
    expect(log[0].actor_type).toBe('system');
    expect(log[0].on_behalf_of).toBe(staff); // LOG-STAFF-SYSTEM-ROWS
    expect(log[0].after).not.toContain('Giá bao nhiêu');
  });

  it('FR-044 bỏ ẩn: gọi setHidden(false); is_hidden=false và status về trạng thái đã ghi khi yêu cầu', async () => {
    const fx = await fixture({ hide: false });
    const { calls, registry } = connectorWith();
    await run(fx, registry);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[2]).toBe(false);
    expect(await commentRow(fx.commentId)).toEqual({ status: 'pending_review', is_hidden: false });
    expect((await hideRow(fx.hideId)).status).toBe('done');
  });

  it('FR-044 chạy lại job đã xong → không gọi connector nữa; bình luận đã ẩn sẵn (người khác ẩn trước) → done mà KHÔNG gọi connector', async () => {
    const fx = await fixture();
    const { calls, registry } = connectorWith();
    await run(fx, registry);
    await run(fx, registry);
    expect(calls).toHaveLength(1);

    const pre = await fixture();
    await admin.query("UPDATE cf.comments SET is_hidden = true, status = 'hidden' WHERE id = $1", [
      pre.commentId,
    ]);
    const second = connectorWith();
    await run(pre, second.registry);
    expect(second.calls).toHaveLength(0);
    expect(await hideRow(pre.hideId)).toMatchObject({ status: 'done', attempts: 0 });
  });

  it('FR-044 ẩn rồi bỏ ẩn → trạng thái ban đầu được khôi phục', async () => {
    const fx = await fixture({ commentStatus: 'needs_human' });
    const { registry } = connectorWith();
    await run(fx, registry);
    const unhideId = await db.withActor(ws, staff, (tx) =>
      requestCommentHide(tx, { commentId: fx.commentId, hide: false }),
    );
    expect(unhideId).toBeTruthy();
    await processHideJob({
      db,
      registry,
      job: { workspaceId: ws, hideId: unhideId as string },
    });
    expect(await commentRow(fx.commentId)).toEqual({ status: 'needs_human', is_hidden: false });
    const unhidden = await admin.query(
      "SELECT on_behalf_of FROM core.action_logs WHERE target_id = $1 AND action = 'comment.unhidden'",
      [fx.commentId],
    );
    expect(unhidden.rows).toEqual([{ on_behalf_of: staff }]); // LOG-STAFF-SYSTEM-ROWS
  });
});

describe('FR-044 job hide — kiểm lại trước khi gọi (H1–H3) và connector', () => {
  it('FR-044 H1 bình luận đã xóa/đã gộp → hủy recheck:H1, KHÔNG gọi connector, bình luận không đổi', async () => {
    for (const set of [
      'deleted_at = now()',
      `merged_into_id = (SELECT id FROM cf.comments WHERE workspace_id = '${ws}' AND id <> $1 LIMIT 1)`,
    ]) {
      const fx = await fixture();
      await admin.query(`UPDATE cf.comments SET ${set} WHERE id = $1`, [fx.commentId]);
      const { calls, registry } = connectorWith();
      await run(fx, registry);
      expect(calls).toHaveLength(0);
      expect(await hideRow(fx.hideId)).toMatchObject({
        status: 'cancelled',
        error_code: 'recheck:H1',
      });
      expect((await commentRow(fx.commentId)).is_hidden).toBe(false);
    }
  });

  it('FR-044 H2 trạng thái đã đổi sang trạng thái hệ thống (sending) → hủy recheck:H2, không gọi', async () => {
    const fx = await fixture();
    await admin.query("UPDATE cf.comments SET status = 'sending' WHERE id = $1", [fx.commentId]);
    const { calls, registry } = connectorWith();
    await run(fx, registry);
    expect(calls).toHaveLength(0);
    expect(await hideRow(fx.hideId)).toMatchObject({
      status: 'cancelled',
      error_code: 'recheck:H2',
    });
    expect((await commentRow(fx.commentId)).status).toBe('sending');
  });

  it('FR-044 H3 kênh không còn connected → failed recheck:H3, không gọi', async () => {
    const fx = await fixture({ channelStatus: 'expired' });
    const { calls, registry } = connectorWith();
    await run(fx, registry);
    expect(calls).toHaveLength(0);
    expect(await hideRow(fx.hideId)).toMatchObject({ status: 'failed', error_code: 'recheck:H3' });
    expect(await commentRow(fx.commentId)).toEqual({ status: 'needs_human', is_hidden: false });
  });

  it('FR-044 sổ connector rỗng → failed connector_unavailable', async () => {
    const fx = await fixture();
    await run(fx, createConnectorRegistry([]));
    expect(await hideRow(fx.hideId)).toMatchObject({
      status: 'failed',
      error_code: 'connector_unavailable',
    });
    expect((await commentRow(fx.commentId)).is_hidden).toBe(false);
  });

  it('FR-044 nền tảng không hỗ trợ ẩn (capabilities) hoặc thiếu setHidden → failed ACTION_UNSUPPORTED, không gọi', async () => {
    const unsupported: ConnectorCapabilities = {
      ...DECLARED_CAPABILITIES.facebook,
      hide: { supported: false, verified: true },
    };
    const fx = await fixture();
    const noHide = connectorWith({ capabilities: unsupported });
    await run(fx, noHide.registry);
    expect(noHide.calls).toHaveLength(0);
    expect(await hideRow(fx.hideId)).toMatchObject({
      status: 'failed',
      error_code: 'ACTION_UNSUPPORTED',
    });

    const fx2 = await fixture();
    const missing = connectorWith({ withoutSetHidden: true });
    await run(fx2, missing.registry);
    expect(await hideRow(fx2.hideId)).toMatchObject({
      status: 'failed',
      error_code: 'ACTION_UNSUPPORTED',
    });
  });
});

describe('FR-044 job hide — lỗi nền tảng', () => {
  it('FR-044 TOKEN_EXPIRED → failed + kênh expired; PERMISSION (một bình luận không ẩn được) và BLOCKED → failed, kênh VẪN connected; bình luận KHÔNG đổi; mã lỗi không chứa nội dung/token', async () => {
    const cases: Array<[PlatformErrorCode, string]> = [
      ['TOKEN_EXPIRED', 'expired'],
      ['PERMISSION', 'connected'],
      ['BLOCKED', 'connected'],
    ];
    for (const [code, expectedChannel] of cases) {
      const fx = await fixture();
      const { registry } = connectorWith({ setHidden: failWith(code) });
      await run(fx, registry);
      const row = await hideRow(fx.hideId);
      expect(row, code).toMatchObject({ status: 'failed', error_code: code });
      expect(JSON.stringify(row)).not.toContain('EAAG');
      expect(await channelStatus(fx.channelId), code).toBe(expectedChannel);
      expect(await commentRow(fx.commentId), code).toEqual({
        status: 'needs_human',
        is_hidden: false,
      });
    }
  });

  it('FR-044 RATE_LIMIT → trả queued và ném HideRetryableError; lần sau thành công thì ẩn đúng một lần ghi nhận', async () => {
    const fx = await fixture();
    let first = true;
    const { calls, registry } = connectorWith({
      setHidden: async () => {
        if (first) {
          first = false;
          await failWith('RATE_LIMIT')();
        }
      },
    });
    await expect(run(fx, registry)).rejects.toBeInstanceOf(HideRetryableError);
    expect(await hideRow(fx.hideId)).toMatchObject({ status: 'queued', attempts: 1 });
    expect((await commentRow(fx.commentId)).is_hidden).toBe(false);
    await run(fx, registry);
    expect(calls).toHaveLength(2);
    expect(await hideRow(fx.hideId)).toMatchObject({ status: 'done', attempts: 2 });
    expect((await commentRow(fx.commentId)).is_hidden).toBe(true);
  });

  it('FR-044 UNKNOWN lặp lại: thử lại tới hết lượt thì ghi failed UNKNOWN; bình luận không đổi', async () => {
    const fx = await fixture();
    const { registry } = connectorWith({ setHidden: failWith('UNKNOWN') });
    for (let i = 1; i < MAX_HIDE_ATTEMPTS; i += 1) {
      await expect(run(fx, registry)).rejects.toBeInstanceOf(HideRetryableError);
    }
    await run(fx, registry);
    expect(await hideRow(fx.hideId)).toMatchObject({
      status: 'failed',
      error_code: 'UNKNOWN',
      attempts: MAX_HIDE_ATTEMPTS,
    });
    expect((await commentRow(fx.commentId)).is_hidden).toBe(false);
  });
});

describe('FR-044 job hide — chạy song song và tiếp quản', () => {
  it('FR-044 hai job cùng yêu cầu chạy song song → connector chỉ bị gọi MỘT lần (job kia chờ/ném in-flight)', async () => {
    const fx = await fixture();
    const { calls, registry } = connectorWith({
      setHidden: () => new Promise((resolve) => setTimeout(resolve, 300)),
    });
    const results = await Promise.allSettled([
      run(fx, registry, { sleep: noSleep }),
      run(fx, registry, { sleep: noSleep }),
    ]);
    expect(calls).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await hideRow(fx.hideId)).status).toBe('done');
    expect((await commentRow(fx.commentId)).is_hidden).toBe(true);
  });

  it('FR-044 đang sending còn thuê → HideInFlightError (không gọi); thuê hết hạn → job tiếp quản và gọi', async () => {
    const fx = await fixture();
    await admin.query(
      "UPDATE cf.comment_hides SET status = 'sending', attempts = 1, updated_at = now() WHERE id = $1",
      [fx.hideId],
    );
    const young = connectorWith();
    await expect(run(fx, young.registry, { sleep: noSleep })).rejects.toBeInstanceOf(
      HideInFlightError,
    );
    expect(young.calls).toHaveLength(0);

    await admin.query(
      "UPDATE cf.comment_hides SET updated_at = now() - interval '10 minutes' WHERE id = $1",
      [fx.hideId],
    );
    const stale = connectorWith();
    await run(fx, stale.registry);
    expect(stale.calls).toHaveLength(1);
    expect(await hideRow(fx.hideId)).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('FR-044 rào ghi kết quả: job chạy quá hạn thuê mà job khác đã tiếp quản thì KHÔNG ghi đè kết quả', async () => {
    const fx = await fixture();
    const { registry } = connectorWith({
      setHidden: async () => {
        // giữa lúc gọi nền tảng, job khác tiếp quản (attempts tăng)
        await admin.query('UPDATE cf.comment_hides SET attempts = attempts + 1 WHERE id = $1', [
          fx.hideId,
        ]);
      },
    });
    await run(fx, registry);
    expect(await hideRow(fx.hideId)).toMatchObject({ status: 'sending', attempts: 2 });
    expect((await commentRow(fx.commentId)).is_hidden).toBe(false);
  });
});

describe('FR-044 job hide — bổ sung sau kiểm chứng', () => {
  it('FR-044 H1 bình luận do chính Page viết (is_own) → hủy recheck:H1, không gọi connector', async () => {
    const fx = await fixture();
    await admin.query('UPDATE cf.comments SET is_own = true WHERE id = $1', [fx.commentId]);
    const { calls, registry } = connectorWith();
    await run(fx, registry);
    expect(calls).toHaveLength(0);
    expect(await hideRow(fx.hideId)).toMatchObject({
      status: 'cancelled',
      error_code: 'recheck:H1',
    });
  });

  it('FR-044 trạng thái bình luận đổi lúc yêu cầu còn queued → worker cập nhật previous_status khi đánh dấu sending', async () => {
    const fx = await fixture({ commentStatus: 'needs_human' });
    await admin.query("UPDATE cf.comments SET status = 'skipped' WHERE id = $1", [fx.commentId]);
    const { registry } = connectorWith();
    await run(fx, registry);
    expect((await hideRow(fx.hideId)).previous_status).toBe('skipped');
    const unhideId = await db.withActor(ws, staff, (tx) =>
      requestCommentHide(tx, { commentId: fx.commentId, hide: false }),
    );
    await processHideJob({ db, registry, job: { workspaceId: ws, hideId: unhideId as string } });
    expect(await commentRow(fx.commentId)).toEqual({ status: 'skipped', is_hidden: false });
  });

  it('FR-044 khách xóa (đã xóa trắng) giữa lúc gọi nền tảng → vẫn ghi done và is_hidden, không lỗi', async () => {
    const fx = await fixture();
    const { registry } = connectorWith({
      setHidden: async () => {
        await admin.query(
          "UPDATE cf.comments SET deleted_at = now(), redacted_at = now(), text = '', text_normalized = NULL, author_name = NULL, author_external_id = '', attachments = '[]'::jsonb WHERE id = $1",
          [fx.commentId],
        );
      },
    });
    await run(fx, registry);
    expect((await hideRow(fx.hideId)).status).toBe('done');
    expect((await commentRow(fx.commentId)).is_hidden).toBe(true);
  });

  it('FR-044 yêu cầu có requested_by NULL (người yêu cầu đã bị xóa) vẫn chạy bình thường', async () => {
    const fx = await fixture();
    await admin.query('UPDATE cf.comment_hides SET requested_by = NULL WHERE id = $1', [fx.hideId]);
    const { calls, registry } = connectorWith();
    await run(fx, registry);
    expect(calls).toHaveLength(1);
    expect((await hideRow(fx.hideId)).status).toBe('done');
    const log = await admin.query(
      "SELECT after->>'requested_by' AS by, on_behalf_of FROM core.action_logs WHERE target_id = $1 AND action = 'comment.hidden'",
      [fx.commentId],
    );
    expect(log.rows[0].by).toBeNull();
    expect(log.rows[0].on_behalf_of).toBeNull();
  });
});

describe('FR-044 handler hàng đợi hide', () => {
  const asJob = (data: unknown, extra: object = {}) =>
    [{ id: randomUUID(), data, ...extra }] as unknown as Job<unknown>[];

  it('FR-044 dữ liệu job sai → ném lỗi không chứa dữ liệu; job đúng chạy bình thường', async () => {
    const { registry } = connectorWith();
    const handler = createHideHandler({ db, registry, logger: quiet });
    await expect(handler(asJob({ khong: 'dung' }))).rejects.toThrow('Dữ liệu job không hợp lệ');
    const fx = await fixture();
    await handler(asJob({ workspaceId: ws, hideId: fx.hideId }));
    expect((await hideRow(fx.hideId)).status).toBe('done');
  });

  it('FR-044 lượt cuối: job khác còn thuê (sending) → KHÔNG ghi đè failed, ném lỗi in-flight; sending hết thuê → failed', async () => {
    const fx = await fixture();
    await admin.query(
      "UPDATE cf.comment_hides SET status = 'sending', attempts = 1, updated_at = now() WHERE id = $1",
      [fx.hideId],
    );
    const { registry } = connectorWith();
    const handler = createHideHandler({ db, registry, logger: quiet, sleep: noSleep });
    const last = { retryCount: 3, retryLimit: 3 };
    // sleep thật ngắn không có trong handler: dùng thuê cạn bằng cách để processHideJob ném in-flight sau lần chờ mặc định
    // (rút ngắn: đặt remaining nhỏ bằng cách lùi updated_at gần hết thuê 90 giây)
    await admin.query(
      "UPDATE cf.comment_hides SET updated_at = now() - interval '89 seconds' WHERE id = $1",
      [fx.hideId],
    );
    await expect(
      handler([
        { id: randomUUID(), data: { workspaceId: ws, hideId: fx.hideId }, ...last },
      ] as unknown as Job<unknown>[]),
    ).rejects.toBeInstanceOf(HideInFlightError);
    expect((await hideRow(fx.hideId)).status).toBe('sending');

    await admin.query(
      "UPDATE cf.comment_hides SET updated_at = now() - interval '10 minutes' WHERE id = $1",
      [fx.hideId],
    );
    const failing = connectorWith({ setHidden: failWith('UNKNOWN') });
    const handler2 = createHideHandler({ db, registry: failing.registry, logger: quiet });
    await handler2([
      { id: randomUUID(), data: { workspaceId: ws, hideId: fx.hideId }, ...last },
    ] as unknown as Job<unknown>[]);
    expect(await hideRow(fx.hideId)).toMatchObject({ status: 'failed', error_code: 'UNKNOWN' });
  });

  it('FR-044 lỗi tạm thời được ném lại để pg-boss thử lại; log chỉ có mã, không token/nội dung; lượt cuối → failed UNKNOWN', async () => {
    const fx = await fixture();
    const { registry } = connectorWith({ setHidden: failWith('UNKNOWN') });
    const logs: unknown[] = [];
    const handler = createHideHandler({
      db,
      registry,
      logger: { error: (...args: unknown[]) => logs.push(args) },
    });
    await expect(handler(asJob({ workspaceId: ws, hideId: fx.hideId }))).rejects.toBeInstanceOf(
      HideRetryableError,
    );
    expect(JSON.stringify(logs)).not.toContain('EAAG');
    expect(JSON.stringify(logs)).not.toContain('Khách');
    expect((await hideRow(fx.hideId)).status).toBe('queued');
    await handler(asJob({ workspaceId: ws, hideId: fx.hideId }, { retryCount: 3, retryLimit: 3 }));
    expect(await hideRow(fx.hideId)).toMatchObject({ status: 'failed', error_code: 'UNKNOWN' });
    expect((await commentRow(fx.commentId)).is_hidden).toBe(false);
  });
});
