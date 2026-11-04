import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminPool, newId, seedWorkspace } from './helpers';

/** CH-SCHEMA: ràng buộc dữ liệu (CHECK, UNIQUE, khóa ngoại ghép chống chéo workspace, mặc định) — chạy bằng quyền chủ sở hữu. */
let admin: pg.Pool;
let wsA: string;
let wsB: string;
let channelA: string;
let channelB: string;
let postA: string;

const code = async (promise: Promise<unknown>): Promise<string | undefined> => {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
};
const UNIQUE = '23505';
const FK = '23503';
const CHECK = '23514';

const channel = (ws: string, extra = '', values: unknown[] = []) =>
  admin.query(
    `INSERT INTO cf.channels (workspace_id, platform, external_id, name${extra ? `, ${extra.split('=')[0]}` : ''})
     VALUES ($1, 'facebook', $2, 'K'${extra ? `, ${extra.split('=')[1]}` : ''}) RETURNING id`,
    [ws, `x-${newId()}`, ...values],
  );

beforeAll(async () => {
  admin = createAdminPool();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  channelA = (await channel(wsA)).rows[0].id;
  channelB = (await channel(wsB)).rows[0].id;
  postA = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [wsA, channelA, `p-${newId()}`],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await admin.end();
});

const insertComment = (
  ws: string,
  ch: string,
  post: string,
  external = `c-${newId()}`,
  status = 'new',
) =>
  admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status)
     VALUES ($1, $2, $3, $4, 'u', 't', $5) RETURNING id`,
    [ws, ch, post, external, status],
  );

describe('FR-010 channels', () => {
  it('mặc định theo spec: status connected, reply_language auto, webhook_subscribed false, scopes/capabilities rỗng', async () => {
    const { rows } = await admin.query(
      'SELECT status, reply_language, webhook_subscribed, scopes, capabilities, access_token_enc FROM cf.channels WHERE id = $1',
      [channelA],
    );
    expect(rows[0]).toEqual({
      status: 'connected',
      reply_language: 'auto',
      webhook_subscribed: false,
      scopes: [],
      capabilities: {},
      access_token_enc: null,
    });
  });

  it('CHECK: platform, status, reply_language chỉ nhận giá trị trong spec', async () => {
    expect(
      await code(
        admin.query(
          "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'zalo', 'a', 'x')",
          [wsA],
        ),
      ),
    ).toBe(CHECK);
    expect(
      await code(admin.query("UPDATE cf.channels SET status = 'bogus' WHERE id = $1", [channelA])),
    ).toBe(CHECK);
    expect(
      await code(
        admin.query("UPDATE cf.channels SET reply_language = 'fr' WHERE id = $1", [channelA]),
      ),
    ).toBe(CHECK);
    for (const status of ['connected', 'expired', 'revoked', 'error']) {
      await admin.query('UPDATE cf.channels SET status = $2 WHERE id = $1', [channelA, status]);
    }
    await admin.query("UPDATE cf.channels SET status = 'connected' WHERE id = $1", [channelA]);
  });

  it('UNIQUE (platform, external_id, workspace_id): trùng trong cùng workspace bị chặn; workspace khác được (spec cho phép)', async () => {
    const ext = `dup-${newId()}`;
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'a')",
      [wsA, ext],
    );
    expect(
      await code(
        admin.query(
          "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'b')",
          [wsA, ext],
        ),
      ),
    ).toBe(UNIQUE);
    await expect(
      admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'c')",
        [wsB, ext],
      ),
    ).resolves.toBeTruthy();
  });
});

describe('khóa ngoại ghép chống chéo workspace', () => {
  it('post mang workspace A nhưng channel của B → 23503', async () => {
    expect(
      await code(
        admin.query(
          'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3)',
          [wsA, channelB, `p-${newId()}`],
        ),
      ),
    ).toBe(FK);
  });

  it('comment: channel của B, hoặc post của workspace khác → 23503; đúng workspace thì được', async () => {
    expect(await code(insertComment(wsA, channelB, postA))).toBe(FK);
    const postB = (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [wsB, channelB, `p-${newId()}`],
      )
    ).rows[0].id;
    expect(await code(insertComment(wsA, channelA, postB))).toBe(FK);
    await expect(insertComment(wsA, channelA, postA)).resolves.toBeTruthy();
  });

  it('merged_into_id phải trỏ bình luận CÙNG workspace', async () => {
    const own = (await insertComment(wsA, channelA, postA)).rows[0].id;
    const postB = (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [wsB, channelB, `p-${newId()}`],
      )
    ).rows[0].id;
    const foreign = (await insertComment(wsB, channelB, postB)).rows[0].id;
    expect(
      await code(
        admin.query('UPDATE cf.comments SET merged_into_id = $2 WHERE id = $1', [own, foreign]),
      ),
    ).toBe(FK);
    const other = (await insertComment(wsA, channelA, postA)).rows[0].id;
    await expect(
      admin.query('UPDATE cf.comments SET merged_into_id = $2 WHERE id = $1', [own, other]),
    ).resolves.toBeTruthy();
  });

  it('xóa kênh xóa cả bài và bình luận của nó (cascade) nhưng không đụng workspace khác', async () => {
    const ch = (await channel(wsA)).rows[0].id;
    const post = (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [wsA, ch, `p-${newId()}`],
      )
    ).rows[0].id;
    await insertComment(wsA, ch, post);
    await admin.query('DELETE FROM cf.channels WHERE id = $1', [ch]);
    expect((await admin.query('SELECT 1 FROM cf.posts WHERE id = $1', [post])).rowCount).toBe(0);
    expect(
      (await admin.query('SELECT 1 FROM cf.channels WHERE id = $1', [channelB])).rowCount,
    ).toBe(1);
  });
});

describe('posts và comments', () => {
  it('UNIQUE (channel_id, external_id) cho bài và bình luận (chống trùng webhook)', async () => {
    const ext = `dup-${newId()}`;
    await insertComment(wsA, channelA, postA, ext);
    expect(await code(insertComment(wsA, channelA, postA, ext))).toBe(UNIQUE);
    const pext = `pdup-${newId()}`;
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3)',
      [wsA, channelA, pext],
    );
    expect(
      await code(
        admin.query(
          'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3)',
          [wsA, channelA, pext],
        ),
      ),
    ).toBe(UNIQUE);
  });

  it('comments.status nhận đúng 12 trạng thái của spec, mặc định new; label_source chỉ rule/ml/llm/human', async () => {
    const statuses = [
      'new',
      'processing',
      'pending_review',
      'needs_human',
      'scheduled_auto',
      'sending',
      'replied',
      'auto_replied',
      'send_failed',
      'skipped',
      'spam_suspected',
      'hidden',
    ];
    for (const status of statuses) {
      await expect(
        insertComment(wsA, channelA, postA, `s-${newId()}`, status),
      ).resolves.toBeTruthy();
    }
    expect(await code(insertComment(wsA, channelA, postA, `s-${newId()}`, 'khac'))).toBe(CHECK);
    const id = (await insertComment(wsA, channelA, postA)).rows[0].id;
    expect(
      await code(admin.query("UPDATE cf.comments SET label_source = 'ai' WHERE id = $1", [id])),
    ).toBe(CHECK);
    await admin.query("UPDATE cf.comments SET label_source = 'human' WHERE id = $1", [id]);
    const row = (
      await admin.query(
        'SELECT status, labels, attachments, needs_followup, followup_topics, is_hidden, is_own FROM cf.comments WHERE id = $1',
        [id],
      )
    ).rows[0];
    expect(row).toEqual({
      status: 'new',
      labels: [],
      attachments: [],
      needs_followup: false,
      followup_topics: [],
      is_hidden: false,
      is_own: false,
    });
  });
});

describe('FR-021 webhook_events', () => {
  it('event_hash duy nhất (idempotency); status/platform có CHECK; workspace_id nullable', async () => {
    const hash = `h-${newId()}`;
    await admin.query(
      "INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload) VALUES (NULL, 'facebook', $1, '{}')",
      [hash],
    );
    expect(
      await code(
        admin.query(
          "INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload) VALUES ($1, 'facebook', $2, '{}')",
          [wsA, hash],
        ),
      ),
    ).toBe(UNIQUE);
    expect(
      await code(
        admin.query(
          "INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload) VALUES ($1, 'zalo', $2, '{}')",
          [wsA, `h-${newId()}`],
        ),
      ),
    ).toBe(CHECK);
    expect(
      await code(
        admin.query(
          "INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload, status) VALUES ($1, 'facebook', $2, '{}', 'khac')",
          [wsA, `h-${newId()}`],
        ),
      ),
    ).toBe(CHECK);
    const row = (
      await admin.query('SELECT status, attempts FROM cf.webhook_events WHERE event_hash = $1', [
        hash,
      ])
    ).rows[0];
    expect(row).toEqual({ status: 'received', attempts: 0 });
  });
});
