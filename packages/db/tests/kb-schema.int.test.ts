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
  setActiveEmbeddingModel,
} from './helpers';

/**
 * KB-SCHEMA: kb_sources / kb_versions / kb_chunks (docs/10 §3.4, QKB1). Ai được ghi gì:
 *  - kb_sources: Owner đang hoạt động hoặc HỆ THỐNG (không DELETE, xóa mềm).
 *  - kb_versions: Owner hoặc hệ thống, chỉ INSERT (bất biến).
 *  - kb_chunks: chỉ hệ thống (worker lập chỉ mục); đọc: thành viên đang hoạt động, hệ thống, withWorkspace trần.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
const ids: Record<string, string> = {};
let source: string;
let sourceOther: string;
let version: string;
let versionOther: string;
let chunk: string;

type Who = 'owner' | 'staff' | 'suspended' | 'stranger' | 'otherOwner' | 'system' | 'bare';
const WHO: Who[] = ['owner', 'staff', 'suspended', 'stranger', 'otherOwner', 'system', 'bare'];

const vec = (n: number, x = 0.1): string => `[${Array.from({ length: n }, () => x).join(',')}]`;

beforeAll(async () => {
  admin = createAdminPool();
  await setActiveEmbeddingModel(admin, 'test-model');
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  for (const name of ['owner', 'staff', 'suspended', 'stranger', 'otherOwner']) {
    ids[name] = await seedUser(admin, name);
  }
  await seedMember(admin, ws, ids.owner as string, 'owner');
  await seedMember(admin, ws, ids.staff as string, 'staff');
  await seedMember(admin, ws, ids.suspended as string, 'staff');
  await admin.query("UPDATE core.members SET status = 'suspended' WHERE user_id = $1", [
    ids.suspended,
  ]);
  await seedMember(admin, other, ids.otherOwner as string, 'owner');

  const s = await admin.query(
    "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'FAQ A') RETURNING id",
    [ws],
  );
  source = s.rows[0].id;
  const so = await admin.query(
    "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'FAQ B') RETURNING id",
    [other],
  );
  sourceOther = so.rows[0].id;
  const v = await admin.query(
    'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
    [ws],
  );
  version = v.rows[0].id;
  const vo = await admin.query(
    'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
    [other],
  );
  versionOther = vo.rows[0].id;
  const c = await admin.query(
    `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft)
     VALUES ($1, $2, $3, 'k1', 'Ship 2 ngày', 'vi', 'h1', false) RETURNING id`,
    [ws, source, version],
  );
  chunk = c.rows[0].id;
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

async function run(who: Who, text: string, workspaceId = ws): Promise<number | 'denied'> {
  const exec = (tx: Parameters<Parameters<FlowDb['withWorkspace']>[1]>[0]) =>
    tx.execute(sql.raw(text));
  try {
    const result =
      who === 'system'
        ? await db.withJob(workspaceId, exec)
        : who === 'bare'
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

function expectOnly(results: Record<Who, number | 'denied'>, allowed: Who[], count = 1) {
  for (const who of WHO) {
    if (allowed.includes(who)) expect(results[who], `${who} phải được phép`).toBe(count);
    else expect([0, 'denied'], `${who} phải bị chặn`).toContain(results[who]);
  }
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { cause?: { code?: string }; code?: string };
    return e.cause?.code ?? e.code;
  }
}

describe('FR-050 kb_sources', () => {
  it('SELECT: thành viên đang hoạt động, hệ thống và withWorkspace trần thấy; người ngoài/tạm khóa/workspace khác không', async () => {
    const results = await matrix(() => `SELECT id FROM cf.kb_sources WHERE id = '${source}'`);
    expectOnly(results, ['owner', 'staff', 'system', 'bare']);
  });

  it('INSERT: chỉ Owner hoặc hệ thống; Staff, người ngoài, withWorkspace trần bị chặn', async () => {
    const results = await matrix(
      (who) =>
        `INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ('${ws}', 'manual', 'ins-${who}-${newId()}')`,
    );
    expectOnly(results, ['owner', 'system']);
  });

  it('INSERT với workspace_id của workspace khác bị chặn (kể cả Owner/hệ thống)', async () => {
    for (const who of ['owner', 'system'] as Who[]) {
      const r = await run(
        who,
        `INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ('${other}', 'manual', 'x')`,
      );
      expect(r, who).toBe('denied');
    }
  });

  it('UPDATE title/status: chỉ Owner hoặc hệ thống; không đổi được workspace_id, type, external_key', async () => {
    const results = await matrix(
      () => `UPDATE cf.kb_sources SET title = 'Đổi', status = 'syncing' WHERE id = '${source}'`,
    );
    expectOnly(results, ['owner', 'system']);
    for (const col of [`workspace_id = '${other}'`, "type = 'excel'", "external_key = 'k'"]) {
      expect(await run('owner', `UPDATE cf.kb_sources SET ${col} WHERE id = '${source}'`)).toBe(
        'denied',
      );
    }
  });

  it('cách ly chéo workspace: Owner workspace B không thấy hay sửa nguồn của A', async () => {
    expect(
      await run('otherOwner', `SELECT id FROM cf.kb_sources WHERE id = '${source}'`, other),
    ).toBe(0);
    expect(
      await run(
        'otherOwner',
        `UPDATE cf.kb_sources SET title = 'hack' WHERE id = '${source}'`,
        other,
      ),
    ).toBe(0);
    // Chỉ thấy nguồn của chính mình
    expect(
      await run('otherOwner', `SELECT id FROM cf.kb_sources WHERE id = '${sourceOther}'`, other),
    ).toBe(1);
  });

  it('KHÔNG ai DELETE được (xóa mềm bằng deleted_at)', async () => {
    const results = await matrix(() => `DELETE FROM cf.kb_sources WHERE id = '${source}'`);
    for (const who of WHO) expect(results[who], who).toBe('denied');
  });

  it('CHECK type/status; external_key duy nhất theo (workspace, type) khi nguồn chưa xóa', async () => {
    expect(
      await codeOf(
        admin.query(
          "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'zzz', 't')",
          [ws],
        ),
      ),
    ).toBe('23514');
    expect(
      await codeOf(
        admin.query(
          "INSERT INTO cf.kb_sources (workspace_id, type, title, status) VALUES ($1, 'faq', 't', 'zzz')",
          [ws],
        ),
      ),
    ).toBe('23514');
    const key = `ek-${newId()}`;
    await admin.query(
      "INSERT INTO cf.kb_sources (workspace_id, type, title, external_key) VALUES ($1, 'shopify', 't', $2)",
      [ws, key],
    );
    expect(
      await codeOf(
        admin.query(
          "INSERT INTO cf.kb_sources (workspace_id, type, title, external_key) VALUES ($1, 'shopify', 't2', $2)",
          [ws, key],
        ),
      ),
    ).toBe('23505');
  });
});

describe('FR-055 kb_versions', () => {
  it('INSERT: chỉ Owner hoặc hệ thống; sai workspace bị chặn', async () => {
    let n = 100;
    const results = await matrix(
      (who) =>
        `INSERT INTO cf.kb_versions (workspace_id, number, published_by) VALUES ('${ws}', ${n++}, ${who === 'owner' ? `'${ids.owner}'` : 'NULL'})`,
    );
    expectOnly(results, ['owner', 'system']);
    // Owner không được ghi tên người khác vào "ai xuất bản"
    expect(
      await run(
        'owner',
        `INSERT INTO cf.kb_versions (workspace_id, number, published_by) VALUES ('${ws}', ${n++}, '${ids.staff}')`,
      ),
    ).toBe('denied');
    expect(
      await run(
        'owner',
        `INSERT INTO cf.kb_versions (workspace_id, number) VALUES ('${other}', 7)`,
      ),
    ).toBe('denied');
  });

  it('bất biến: không ai UPDATE hay DELETE được', async () => {
    const upd = await matrix(() => `UPDATE cf.kb_versions SET note = 'x' WHERE id = '${version}'`);
    const del = await matrix(() => `DELETE FROM cf.kb_versions WHERE id = '${version}'`);
    for (const who of WHO) {
      expect(upd[who], `update ${who}`).toBe('denied');
      expect(del[who], `delete ${who}`).toBe('denied');
    }
  });

  it('SELECT chéo workspace: B không thấy phiên bản của A; (workspace, number) duy nhất; number >= 1', async () => {
    expect(
      await run('otherOwner', `SELECT id FROM cf.kb_versions WHERE id = '${version}'`, other),
    ).toBe(0);
    expect(
      await codeOf(
        admin.query('INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1)', [ws]),
      ),
    ).toBe('23505');
    expect(
      await codeOf(
        admin.query('INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 0)', [ws]),
      ),
    ).toBe('23514');
    const results = await matrix(() => `SELECT id FROM cf.kb_versions WHERE id = '${version}'`);
    expectOnly(results, ['owner', 'staff', 'system', 'bare']);
  });
});

describe('FR-055 kb_chunks', () => {
  const insertChunk = (workspaceId: string, key: string) =>
    `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft)
     VALUES ('${workspaceId}', '${source}', NULL, '${key}', 'nội dung', 'vi', 'h', true)`;

  it('SELECT: thành viên đang hoạt động, hệ thống, withWorkspace trần; người ngoài/tạm khóa không', async () => {
    const results = await matrix(() => `SELECT id FROM cf.kb_chunks WHERE id = '${chunk}'`);
    expectOnly(results, ['owner', 'staff', 'system', 'bare']);
  });

  it('INSERT/UPDATE/DELETE: chỉ hệ thống (Owner cũng không ghi trực tiếp)', async () => {
    const ins = await matrix((who) => insertChunk(ws, `ins-${who}-${newId()}`));
    expectOnly(ins, ['system']);
    const upd = await matrix(
      () =>
        `UPDATE cf.kb_chunks SET content = 'sửa', injection_suspected = true WHERE id = '${chunk}'`,
    );
    expectOnly(upd, ['system']);
    const del = await matrix(
      (who) => `DELETE FROM cf.kb_chunks WHERE chunk_key = 'ins-${who}-zzz'`,
    );
    for (const who of WHO) expect([0, 'denied']).toContain(del[who]);
    // hệ thống xóa được đoạn nháp của mình
    await admin.query(
      "INSERT INTO cf.kb_chunks (workspace_id, source_id, chunk_key, content, lang, content_hash, is_draft) VALUES ($1,$2,'to-del','x','vi','h',true)",
      [ws, source],
    );
    expect(await run('system', "DELETE FROM cf.kb_chunks WHERE chunk_key = 'to-del'")).toBe(1);
    // Owner có quyền DELETE mức bảng nhưng policy chỉ cho hệ thống → 0 dòng
    expect([0, 'denied']).toContain(
      await run('owner', "DELETE FROM cf.kb_chunks WHERE chunk_key = 'k1'"),
    );
    const remaining = await admin.query("SELECT 1 FROM cf.kb_chunks WHERE chunk_key = 'k1'");
    expect(remaining.rowCount).toBe(1);
  });

  it('không đổi được cột định danh (workspace_id, source_id, version_id) kể cả hệ thống', async () => {
    for (const col of [
      `workspace_id = '${other}'`,
      `source_id = '${source}'`,
      `version_id = '${version}'`,
    ]) {
      expect(await run('system', `UPDATE cf.kb_chunks SET ${col} WHERE id = '${chunk}'`)).toBe(
        'denied',
      );
    }
  });

  it('cách ly chéo workspace: B không thấy đoạn của A; hệ thống ở B không ghi được workspace_id của A', async () => {
    expect(
      await run('otherOwner', `SELECT id FROM cf.kb_chunks WHERE id = '${chunk}'`, other),
    ).toBe(0);
    expect(await run('system', `SELECT id FROM cf.kb_chunks WHERE id = '${chunk}'`, other)).toBe(0);
    expect(await run('system', insertChunk(ws, 'x-ws'), other)).toBe('denied');
  });

  it('khóa ngoại ghép: đoạn không trỏ được tới nguồn hoặc phiên bản của workspace khác (23503)', async () => {
    expect(
      await codeOf(
        admin.query(
          "INSERT INTO cf.kb_chunks (workspace_id, source_id, chunk_key, content, lang, content_hash) VALUES ($1,$2,'fk1','x','vi','h')",
          [ws, sourceOther],
        ),
      ),
    ).toBe('23503');
    expect(
      await codeOf(
        admin.query(
          "INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft) VALUES ($1,$2,$3,'fk2','x','vi','h',false)",
          [ws, source, versionOther],
        ),
      ),
    ).toBe('23503');
  });

  it('CHECK: đoạn đã xuất bản phải có version_id; valid_until > valid_from; lang vi/en (FR-131)', async () => {
    const base =
      "INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft, valid_from, valid_until) VALUES ($1,$2,$3,$4,'x',$5,'h',$6,$7,$8)";
    const args = (over: Partial<Record<number, unknown>>) => {
      const a: unknown[] = [ws, source, null, `c-${newId()}`, 'vi', true, null, null];
      for (const [i, v] of Object.entries(over)) a[Number(i)] = v;
      return a;
    };
    expect(await codeOf(admin.query(base, args({ 5: false })))).toBe('23514'); // xuất bản, thiếu version_id
    expect(await codeOf(admin.query(base, args({ 6: '2026-02-01', 7: '2026-01-01' })))).toBe(
      '23514',
    );
    expect(await codeOf(admin.query(base, args({ 4: 'fr' })))).toBe('23514');
    expect(
      await codeOf(admin.query(base, args({ 6: '2026-01-01', 7: '2026-02-01' }))),
    ).toBeUndefined();
  });

  it('chunk_key duy nhất theo (workspace, nguồn, phiên bản), kể cả khi version_id rỗng (nháp)', async () => {
    const key = `dup-${newId()}`;
    const q =
      "INSERT INTO cf.kb_chunks (workspace_id, source_id, chunk_key, content, lang, content_hash, is_draft) VALUES ($1,$2,$3,'x','vi','h',true)";
    await admin.query(q, [ws, source, key]);
    expect(await codeOf(admin.query(q, [ws, source, key]))).toBe('23505');
  });

  it('FR-130 context_header và FR-133 embedding_model: hệ thống ghi được, đọc lại đúng', async () => {
    expect(
      await run(
        'system',
        `UPDATE cf.kb_chunks SET context_header = 'FAQ › Vận chuyển', embedding_model = 'model-x@rev1' WHERE id = '${chunk}'`,
      ),
    ).toBe(1);
    const row = await admin.query(
      'SELECT context_header, embedding_model FROM cf.kb_chunks WHERE id = $1',
      [chunk],
    );
    expect(row.rows[0]).toEqual({
      context_header: 'FAQ › Vận chuyển',
      embedding_model: 'model-x@rev1',
    });
  });

  it('FR-139 embedding halfvec(1024): lưu vector 1024 chiều, từ chối chiều khác, truy vấn cosine chạy', async () => {
    const set = (v: string) =>
      run(
        'system',
        `UPDATE cf.kb_chunks SET embedding = '${v}'::halfvec, embedding_model = 'test-model' WHERE id = '${chunk}'`,
      );
    expect(await set(vec(1024))).toBe(1);
    expect(
      await codeOf(
        admin.query(`UPDATE cf.kb_chunks SET embedding = '${vec(3)}' WHERE id = $1`, [chunk]),
      ),
    ).toBeDefined();
    const type = await admin.query(
      "SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute WHERE attrelid = 'cf.kb_chunks'::regclass AND attname = 'embedding'",
    );
    expect(type.rows[0].t).toBe('halfvec(1024)');
    const res = await db.withWorkspace(ws, (tx) =>
      tx.execute(
        sql.raw(
          `SELECT id, embedding <=> '${vec(1024)}'::halfvec AS dist FROM cf.kb_chunks WHERE workspace_id = '${ws}' AND embedding IS NOT NULL ORDER BY embedding <=> '${vec(1024)}'::halfvec LIMIT 1`,
        ),
      ),
    );
    expect(res.rows[0]?.id).toBe(chunk);
  });

  it('tsv full-text: trigger kb_chunks_fill_search tự điền tsv từ content (QKS1)', async () => {
    await run('system', `UPDATE cf.kb_chunks SET content = 'ship hai ngay' WHERE id = '${chunk}'`);
    const res = await db.withWorkspace(ws, (tx) =>
      tx.execute(
        sql.raw(`SELECT id FROM cf.kb_chunks WHERE tsv @@ websearch_to_tsquery('simple', 'ship')`),
      ),
    );
    expect(res.rows.map((r) => r.id)).toContain(chunk);
  });
});
