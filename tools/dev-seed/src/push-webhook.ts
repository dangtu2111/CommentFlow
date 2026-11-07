import { eventHashOf, parseMetaWebhook, serializeEvent } from '@flow/connectors';
import { type FlowDb, recordWebhookEvent } from '@flow/db/runtime';
import { AppError } from '@flow/shared';
import type pg from 'pg';

/**
 * Đẩy MỘT webhook bình luận FIXTURE vào một workspace dev để thấy pipeline chạy thật (job `ingest` → job `pipeline` → bản nháp). CHỈ
 * `cf_dev` (cổng `assertDevSeedAllowed` ở CLI). Dùng ĐÚNG đường thật: ghi `webhook_events` bằng hàm DEFINER (`withSystem`, role cf_app)
 * rồi đẩy job `ingest` — không chèn thẳng bình luận. Mọi dữ liệu mang nhãn `[FIXTURE]`/tiền tố `fixture-` và dọn được bằng `--cleanup`;
 * không phải số liệu thật, không dữ liệu khách thật.
 */
export const FIXTURE_CHANNEL_NAME = '[FIXTURE] Page thử pipeline';
export const FIXTURE_POST_SUFFIX = 'fixture-post-1';
export const FIXTURE_AUTHOR = 'fixture-user-1';
export const DEFAULT_FIXTURE_WORKSPACE = 'Shop Thử 2';
export const DEFAULT_FIXTURE_TEXT = 'Áo thun basic giá bao nhiêu shop?';

export type PushArgs = { workspace: string; text: string; cleanup: boolean };
export type ParsedPushArgs = { ok: true; args: PushArgs } | { ok: false; error: string };

const USAGE =
  'Cách dùng: dev:push-webhook [--workspace "<tên hoặc id>"] [--text "<bình luận>"] [--cleanup]';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePushArgs(argv: readonly string[]): ParsedPushArgs {
  const args: PushArgs = {
    workspace: DEFAULT_FIXTURE_WORKSPACE,
    text: DEFAULT_FIXTURE_TEXT,
    cleanup: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cleanup') args.cleanup = true;
    else if (arg === '--workspace' || arg === '--text') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--') || value.trim() === '') {
        return { ok: false, error: `${arg} cần một giá trị. ${USAGE}` };
      }
      if (arg === '--workspace') args.workspace = value.trim();
      else args.text = value.trim().slice(0, 1000);
      i += 1;
    } else return { ok: false, error: `Tham số lạ: ${String(arg)}. ${USAGE}` };
  }
  return { ok: true, args };
}

/** Mã Page fixture ổn định theo workspace (không đụng Page thật). */
export const fixturePageId = (workspaceId: string): string =>
  `fixture-page-${workspaceId.slice(0, 8)}`;

export type PushContext = {
  admin: pg.Pool;
  /** Kết nối role cf_app (ghi sự kiện bằng hàm DEFINER ở ngữ cảnh trần, như route webhook). */
  appDb: FlowDb;
  /** Đẩy job `ingest` (pg-boss) — tiêm được để test. */
  enqueue: (job: { workspaceId: string; eventId: string }) => Promise<void>;
  now?: () => Date;
  randomId?: () => string;
};

async function resolveWorkspace(
  admin: pg.Pool,
  ref: string,
): Promise<{ id: string; name: string }> {
  const rows = UUID.test(ref)
    ? await admin.query<{ id: string; name: string }>(
        'SELECT id, name FROM core.workspaces WHERE id = $1',
        [ref],
      )
    : await admin.query<{ id: string; name: string }>(
        'SELECT id, name FROM core.workspaces WHERE name = $1',
        [ref],
      );
  if (rows.rowCount !== 1 || !rows.rows[0]) {
    throw new AppError(
      'NOT_FOUND',
      rows.rowCount === 0
        ? `Không thấy workspace "${ref}".`
        : `Có nhiều workspace tên "${ref}" — dùng id.`,
    );
  }
  return rows.rows[0];
}

async function ensureChannel(admin: pg.Pool, workspaceId: string): Promise<string> {
  const pageId = fixturePageId(workspaceId);
  const found = await admin.query<{ id: string }>(
    "SELECT id FROM cf.channels WHERE workspace_id = $1 AND platform = 'facebook' AND external_id = $2",
    [workspaceId, pageId],
  );
  if (found.rows[0]) return pageId;
  await admin.query(
    `INSERT INTO cf.channels (workspace_id, platform, external_id, name, status, webhook_subscribed)
     VALUES ($1, 'facebook', $2, $3, 'connected', true)`,
    [workspaceId, pageId, FIXTURE_CHANNEL_NAME],
  );
  return pageId;
}

export type PushResult = {
  workspaceId: string;
  workspaceName: string;
  eventId: string;
  commentExternalId: string;
};

export async function pushFixtureWebhook(ctx: PushContext, args: PushArgs): Promise<PushResult> {
  const workspace = await resolveWorkspace(ctx.admin, args.workspace);
  const pageId = await ensureChannel(ctx.admin, workspace.id);
  const now = (ctx.now ?? (() => new Date()))();
  const suffix = (ctx.randomId ?? (() => crypto.randomUUID().slice(0, 8)))();
  const postExternal = `${pageId}_${FIXTURE_POST_SUFFIX}`;
  const commentExternal = `${FIXTURE_POST_SUFFIX}_${suffix}`;
  const [event] = parseMetaWebhook({
    object: 'page',
    entry: [
      {
        id: pageId,
        time: Math.floor(now.getTime() / 1000),
        changes: [
          {
            field: 'feed',
            value: {
              from: { id: FIXTURE_AUTHOR, name: 'Khách Thử (fixture)' },
              message: args.text,
              post_id: postExternal,
              comment_id: commentExternal,
              created_time: Math.floor(now.getTime() / 1000),
              item: 'comment',
              parent_id: postExternal,
              verb: 'add',
            },
          },
        ],
      },
    ],
  });
  if (!event) throw new AppError('INTERNAL', 'Fixture webhook không parse được.');
  const rows = await ctx.appDb.withSystem((tx) =>
    recordWebhookEvent(tx, {
      platform: 'facebook',
      pageExternalId: pageId,
      eventHash: eventHashOf('facebook', event),
      payload: serializeEvent(event),
    }),
  );
  const row = rows.find((r) => r.workspaceId === workspace.id);
  if (!row) throw new AppError('INTERNAL', 'Không ghi được sự kiện cho workspace này.');
  await ctx.enqueue({ workspaceId: workspace.id, eventId: row.eventId });
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    eventId: row.eventId,
    commentExternalId: commentExternal,
  };
}

/** Dọn mọi dữ liệu fixture của workspace: bản nháp, bình luận, bài, kênh fixture, sự kiện webhook của Page fixture. */
export async function cleanupFixture(
  admin: pg.Pool,
  workspaceRef: string,
): Promise<{ workspaceId: string; comments: number; drafts: number }> {
  const workspace = await resolveWorkspace(admin, workspaceRef);
  const pageId = fixturePageId(workspace.id);
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    const ids = await client.query<{ id: string }>(
      `SELECT c.id FROM cf.comments c JOIN cf.channels ch ON ch.id = c.channel_id AND ch.workspace_id = c.workspace_id
        WHERE c.workspace_id = $1 AND ch.platform = 'facebook' AND ch.external_id = $2`,
      [workspace.id, pageId],
    );
    const commentIds = ids.rows.map((r) => r.id);
    let drafts = 0;
    if (commentIds.length > 0) {
      drafts =
        (
          await client.query(
            "DELETE FROM cf.drafts WHERE workspace_id = $1 AND target_type = 'comment' AND target_id = ANY($2::uuid[])",
            [workspace.id, commentIds],
          )
        ).rowCount ?? 0;
      await client.query(
        'DELETE FROM cf.retrieval_logs WHERE workspace_id = $1 AND comment_id = ANY($2::uuid[])',
        [workspace.id, commentIds],
      );
    }
    await client.query('DELETE FROM cf.comments WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [
      workspace.id,
      commentIds,
    ]);
    await client.query(
      "DELETE FROM cf.posts WHERE workspace_id = $1 AND channel_id IN (SELECT id FROM cf.channels WHERE workspace_id = $1 AND platform = 'facebook' AND external_id = $2)",
      [workspace.id, pageId],
    );
    await client.query(
      "DELETE FROM cf.channels WHERE workspace_id = $1 AND platform = 'facebook' AND external_id = $2",
      [workspace.id, pageId],
    );
    await client.query('COMMIT');
    return { workspaceId: workspace.id, comments: commentIds.length, drafts };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
