import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { searchKbChunks } from '../src/queries/kb-search';
import { createAdminPool, createAppDb, seedWorkspace } from './helpers';

/**
 * PGVECTOR-HYBRID (FR-057): độ chính xác của tìm lai trên bộ fixture nhỏ. Vector là vector đơn vị do test dựng
 * (không gọi mô hình): vector "biết nghĩa" nhưng không khớp chữ; toàn văn khớp chữ chính xác nhưng vector truy vấn
 * bị nhiễu. Lai (RRF) phải đúng ở cả hai loại truy vấn, mỗi nhánh đơn chỉ đúng một loại.
 */

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let ver: string;
const idByKey = new Map<string, string>();

const unit = (i: number): number[] => Array.from({ length: 1024 }, (_, k) => (k === i ? 1 : 0));
const vec = (v: number[]) => `[${v.join(',')}]`;

const CORPUS: { key: string; content: string; axis: number }[] = [
  {
    key: 'refund',
    content: 'Khách trả hàng trong 7 ngày, shop trả lại số đã thanh toán',
    axis: 1,
  },
  { key: 'ship', content: 'Phí vận chuyển nội thành 20 nghìn', axis: 2 },
  { key: 'care', content: 'Bảo quản áo len: giặt tay bằng nước lạnh', axis: 3 },
  { key: 'sku-12', content: 'Mã sản phẩm ABX12 áo khoác dù', axis: 4 },
  { key: 'sku-99', content: 'Mã sản phẩm ABX99 quần jean', axis: 5 },
  { key: 'sale', content: 'Khuyến mãi mùa hè giảm giá áo thun', axis: 6 },
  { key: 'hours', content: 'Giờ làm việc từ tám giờ đến năm giờ chiều', axis: 7 },
];

/** `expected` = đoạn đúng; `vectorAxis` = hướng vector truy vấn (đúng nghĩa ở truy vấn 1, nhiễu ở truy vấn 2). */
const QUERIES = [
  { name: 'ý nghĩa, không trùng chữ', text: 'hoàn tiền', expected: 'refund', vectorAxis: 1 },
  { name: 'mã chính xác, vector nhiễu', text: 'ABX12', expected: 'sku-12', vectorAxis: 6 },
];

const top1 = async (text: string, queryVector?: number[]): Promise<string | undefined> => {
  const hits = await db.withWorkspace(ws, (tx) =>
    searchKbChunks(tx, {
      workspaceId: ws,
      versionId: ver,
      lang: 'vi',
      queryText: text,
      queryVector,
    }),
  );
  const key = [...idByKey.entries()].find(([, id]) => id === hits[0]?.id)?.[0];
  return key;
};

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb();
  ws = await seedWorkspace(admin);
  const src = (
    await admin.query(
      "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'S') RETURNING id",
      [ws],
    )
  ).rows[0].id;
  ver = (
    await admin.query(
      'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
      [ws],
    )
  ).rows[0].id;
  for (const c of CORPUS) {
    const r = await admin.query(
      `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash,
         is_draft, embedding, embedding_model)
       VALUES ($1, $2, $3, $4, $5, 'vi', $6, false, $7::halfvec, 'fixture-axis') RETURNING id`,
      [ws, src, ver, c.key, c.content, `h-${c.key}`, vec(unit(c.axis))],
    );
    idByKey.set(c.key, r.rows[0].id as string);
  }
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-057 độ chính xác tìm lai trên fixture (recall@1)', () => {
  it('lai đúng cả hai truy vấn; chỉ-vector và chỉ-toàn-văn mỗi bên chỉ đúng một', async () => {
    let hybrid = 0;
    let vectorOnly = 0;
    let textOnly = 0;
    for (const q of QUERIES) {
      if ((await top1(q.text, unit(q.vectorAxis))) === q.expected) hybrid += 1;
      if ((await top1('', unit(q.vectorAxis))) === q.expected) vectorOnly += 1;
      if ((await top1(q.text)) === q.expected) textOnly += 1;
    }
    expect(hybrid).toBe(QUERIES.length);
    expect(vectorOnly).toBe(1);
    expect(textOnly).toBe(1);
    expect(hybrid).toBeGreaterThan(Math.max(vectorOnly, textOnly));
  });

  it('khớp cả chữ lẫn vector thì đứng đầu, kể cả khi một nhánh khác xếp một đoạn khác lên nhất', async () => {
    // Vector nghiêng về 'care' nhưng chữ "áo khoác dù" chỉ khớp 'sku-12'; 'sku-12' có vector hạng 2.
    const mixed = unit(3).map((x, i) => (i === 3 ? 0.8 : i === 4 ? 0.6 : x));
    expect(await top1('áo khoác dù', mixed)).toBe('sku-12');
  });
});
