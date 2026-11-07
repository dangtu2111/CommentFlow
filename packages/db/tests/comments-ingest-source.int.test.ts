import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminPool, pgCodeOf, seedWorkspace } from './helpers';

/**
 * `comments.ingest_source` (migration 0072, Q-POR1): bình luận CÓ SẴN trước migration = `backfill` (không tự chạy AI khi bật
 * PIPELINE_ENABLED); cột KHÔNG có mặc định nên dòng MỚI bắt buộc ghi nguồn; CHECK chỉ nhận 3 giá trị.
 */
let admin: pg.Pool;
let ws: string;
let channel: string;
let post: string;

const NOT_NULL = '23502';
const CHECK = '23514';

beforeAll(async () => {
  admin = createAdminPool();
  ws = await seedWorkspace(admin);
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  post = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [ws, channel, `post-${randomUUID()}`],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await admin.end();
});

const insertSql = (withSource: string | null) =>
  withSource === null
    ? 'INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text) VALUES ($1, $2, $3, $4, $5, $6)'
    : 'INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, ingest_source) VALUES ($1, $2, $3, $4, $5, $6, $7)';
const params = (source?: string) => [
  ws,
  channel,
  post,
  `cm-${randomUUID()}`,
  'u1',
  'Giá bao nhiêu?',
  ...(source ? [source] : []),
];

describe('comments.ingest_source — dòng mới phải ghi nguồn rõ ràng', () => {
  it('INSERT không ghi nguồn → lỗi NOT NULL (không có mặc định)', async () => {
    const error = await admin.query(insertSql(null), params()).catch((e: unknown) => e);
    expect(pgCodeOf(error)).toBe(NOT_NULL);
  });

  it('chỉ nhận webhook | polling | backfill; giá trị khác → lỗi CHECK', async () => {
    for (const source of ['webhook', 'polling', 'backfill']) {
      await admin.query(insertSql(source), params(source));
    }
    const error = await admin.query(insertSql('x'), params('hack')).catch((e: unknown) => e);
    expect(pgCodeOf(error)).toBe(CHECK);
  });
});

describe('migration 0072 — dòng CÓ SẴN trước migration thành backfill', () => {
  it('chạy đúng các câu lệnh trong file migration trên bảng có dữ liệu cũ: dòng cũ = backfill, rồi chèn không ghi nguồn → lỗi', async () => {
    const file = readFileSync(
      new URL('../migrations/0072_pipeline_context.sql', import.meta.url),
      'utf8',
    );
    const statements = file
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter((part) => /"cf"\."comments" (ADD COLUMN|ALTER COLUMN) "ingest_source"/.test(part))
      .map((part) => part.replace(/"cf"\."comments"/g, 'pg_temp.t_comments'));
    // Hai câu: ADD COLUMN … DEFAULT 'backfill' NOT NULL và ALTER COLUMN … DROP DEFAULT.
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/DEFAULT 'backfill' NOT NULL/);
    expect(statements[1]).toMatch(/DROP DEFAULT/);

    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE TEMP TABLE t_comments (id int PRIMARY KEY, text text NOT NULL)');
      await client.query("INSERT INTO t_comments VALUES (1, 'cũ một'), (2, 'cũ hai')");
      for (const statement of statements) await client.query(statement);
      const old = await client.query(
        'SELECT id, ingest_source FROM pg_temp.t_comments ORDER BY id',
      );
      expect(old.rows).toEqual([
        { id: 1, ingest_source: 'backfill' },
        { id: 2, ingest_source: 'backfill' },
      ]);
      await client.query('SAVEPOINT s');
      const error = await client
        .query("INSERT INTO pg_temp.t_comments (id, text) VALUES (3, 'mới')")
        .catch((e: unknown) => e);
      expect(pgCodeOf(error)).toBe(NOT_NULL);
      await client.query('ROLLBACK TO SAVEPOINT s');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});
