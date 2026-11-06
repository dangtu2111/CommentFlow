import { createDb } from '@flow/db/runtime';
import { hashPassword } from '@flow/saas-core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_COMMENTS, DEMO_POSTS, DEMO_PRODUCTS, DEMO_WORKSPACE_NAME } from './demo-data';
import { seedDemo } from './seed';

/**
 * Chạy seed THẬT trên DB test (cf_test / cf_test_<làn>) bằng đúng ba role như CLI (cf_owner, cf_app, cf_worker),
 * để lỗi quyền/RLS/CHECK khi ghi (ví dụ GRANT INSERT theo cột của cf.products) bị bắt trước khi lên dev.
 */
const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu ${name}`);
  return v;
};

let admin: pg.Pool;
let appDb: ReturnType<typeof createDb>;
let workerDb: ReturnType<typeof createDb>;

const deps = () => ({
  admin,
  appDb,
  workerDb,
  hashPassword,
  now: new Date(),
  // Cổng chỉ-cf_dev của CLI không áp cho DB test; vẫn từ chối mọi DB không phải cf_test*.
  assertDatabase: ({ database }: { database: string }) => {
    if (!/^cf_test(_[a-z0-9]{1,8})?$/.test(database)) throw new Error(`DB lạ: ${database}`);
  },
});

describe('seedDemo trên DB test', () => {
  beforeAll(() => {
    admin = new pg.Pool({ connectionString: need('TEST_DATABASE_ADMIN_URL'), max: 2 });
    appDb = createDb({ connectionString: need('TEST_DATABASE_URL'), max: 2 });
    workerDb = createDb({ connectionString: need('TEST_DATABASE_WORKER_URL'), max: 2 });
  });
  afterAll(async () => {
    await Promise.all([admin.end(), appDb.close(), workerDb.close()]);
  });

  it('--reset tạo đủ workspace, sản phẩm, biến thể, bình luận, bản nháp', async () => {
    const result = await seedDemo(deps(), { reset: true });
    expect(result.status).toBe('created');
    if (result.status !== 'created') return;
    expect(result.counts.products).toBe(DEMO_PRODUCTS.length);
    expect(result.counts.posts).toBe(DEMO_POSTS.length);
    expect(result.counts.comments).toBe(DEMO_COMMENTS.length);
    const rows = await admin.query<{ products: string; variants: string }>(
      `SELECT (SELECT count(*) FROM cf.products WHERE workspace_id = $1) AS products,
              (SELECT count(*) FROM cf.product_variants WHERE workspace_id = $1) AS variants`,
      [result.workspaceId],
    );
    expect(Number(rows.rows[0]?.products)).toBe(DEMO_PRODUCTS.length);
    expect(Number(rows.rows[0]?.variants)).toBe(
      DEMO_PRODUCTS.reduce((n, p) => n + p.variants.length, 0),
    );
  });

  it('chạy lần hai không --reset: đã có, không ghi gì', async () => {
    const result = await seedDemo(deps(), { reset: false });
    expect(result.status).toBe('exists');
    const ws = await admin.query('SELECT 1 FROM core.workspaces WHERE name = $1', [
      DEMO_WORKSPACE_NAME,
    ]);
    expect(ws.rowCount).toBe(1);
  });
});
