import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * Migration 0084 (KB-DISTILL, chỉ thêm cột): `kb_gaps.fact_topic` chỉ job hệ thống ghi (thành viên bị trigger chặn), CHECK mã chủ đề;
 * `faq_items.status/kind/evidence_quote` mặc định giữ hành vi cũ, Owner duyệt bằng UPDATE status, CHECK giá trị.
 */
const RLS = '42501';
const CHECK = '23514';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let owner: string;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner-0084');
  await seedMember(admin, ws, owner, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

const gapWith = async (factTopic: string | null, topic = 'policy') =>
  (
    await admin.query(
      `INSERT INTO cf.kb_gaps (workspace_id, topic, sample_question_masked, fact_topic) VALUES ($1, $2, 'q', $3) RETURNING id`,
      [ws, topic, factTopic],
    )
  ).rows[0].id as string;

describe('kb_gaps.fact_topic', () => {
  it('job hệ thống ghi được; mã lạ bị CHECK từ chối', async () => {
    await db.withJob(ws, (tx) =>
      tx.execute(
        sql`INSERT INTO cf.kb_gaps (workspace_id, topic, sample_question_masked, fact_topic) VALUES (${ws}::uuid, 'shipping', 'ship?', 'ship_fee')`,
      ),
    );
    const bad = await admin
      .query(
        `INSERT INTO cf.kb_gaps (workspace_id, topic, sample_question_masked, fact_topic) VALUES ($1, 'size', 'q', 'bogus')`,
        [ws],
      )
      .catch((error: { code?: string }) => error.code);
    expect(bad).toBe(CHECK);
  });

  it('thành viên (Owner) KHÔNG đổi được fact_topic, nhưng vẫn đổi được status', async () => {
    const id = await gapWith('returns', 'other');
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        tx.execute(sql`UPDATE cf.kb_gaps SET fact_topic = 'warranty' WHERE id = ${id}::uuid`),
      ),
      RLS,
    );
    await db.withActor(ws, owner, (tx) =>
      tx.execute(sql`UPDATE cf.kb_gaps SET status = 'ignored' WHERE id = ${id}::uuid`),
    );
    const row = (await admin.query('SELECT status, fact_topic FROM cf.kb_gaps WHERE id = $1', [id]))
      .rows[0];
    expect(row).toEqual({ status: 'ignored', fact_topic: 'returns' });
  });

  it('job hệ thống đổi được fact_topic (gộp chủ đề → null)', async () => {
    const id = await gapWith('returns', 'discount');
    await db.withJob(ws, (tx) =>
      tx.execute(sql`UPDATE cf.kb_gaps SET fact_topic = NULL WHERE id = ${id}::uuid`),
    );
    expect(
      (await admin.query('SELECT fact_topic FROM cf.kb_gaps WHERE id = $1', [id])).rows[0]
        .fact_topic,
    ).toBeNull();
  });
});

describe('faq_items nháp chắt lọc', () => {
  it('dòng cũ mặc định published/faq; hệ thống chèn được nháp; Owner duyệt bằng UPDATE status; giá trị lạ bị CHECK', async () => {
    const legacy = (
      await admin.query(
        `INSERT INTO cf.faq_items (workspace_id, question, answer, lang) VALUES ($1, 'q', 'a', 'vi') RETURNING id, status, kind`,
        [ws],
      )
    ).rows[0];
    expect(legacy).toMatchObject({ status: 'published', kind: 'faq' });
    const id = (
      await db.withJob(ws, (tx) =>
        tx.execute<{ id: string }>(sql`
          INSERT INTO cf.faq_items (workspace_id, question, answer, lang, status, kind, evidence_quote, source_chunk_id)
          VALUES (${ws}::uuid, 'Ship?', 'Ship 30k', 'vi', 'draft', 'faq', 'Phí ship 30k', gen_random_uuid())
          RETURNING id`),
      )
    ).rows[0]?.id as string;
    await db.withActor(ws, owner, (tx) =>
      tx.execute(sql`UPDATE cf.faq_items SET status = 'published' WHERE id = ${id}::uuid`),
    );
    expect(
      (await admin.query('SELECT status FROM cf.faq_items WHERE id = $1', [id])).rows[0].status,
    ).toBe('published');
    const bad = await admin
      .query(`UPDATE cf.faq_items SET status = 'weird' WHERE id = $1`, [id])
      .catch((error: { code?: string }) => error.code);
    expect(bad).toBe(CHECK);
  });
});
