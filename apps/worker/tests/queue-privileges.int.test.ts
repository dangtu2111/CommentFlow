import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUEUE_SCHEMA } from '../src/queue/definitions';

/**
 * QUEUE-PROD-INSTALL: role ứng dụng (cf_app) chỉ cần DML trên bảng job của pg-boss, KHÔNG được sửa sổ phiên bản schema (`pgboss.version`) — việc nâng cấp schema thuộc
 * bước cài bằng cf_owner. Cài (global-setup) đã chạy trước.
 */
let app: pg.Pool;

beforeAll(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Thiếu TEST_DATABASE_URL');
  app = new pg.Pool({ connectionString: url, max: 1 });
});
afterAll(async () => {
  await app.end();
});

describe('quyền của cf_app trên schema pg-boss', () => {
  it('đọc được sổ phiên bản nhưng KHÔNG sửa/chèn/xóa được (42501)', async () => {
    const read = await app.query(`SELECT version FROM ${QUEUE_SCHEMA}.version`);
    expect(read.rows.length).toBeGreaterThan(0);
    // Mỗi câu chạy trong giao dịch rồi ROLLBACK: nếu quyền hồi quy (câu thành công) thì cũng không làm hỏng sổ phiên bản của DB test.
    for (const sql of [
      `UPDATE ${QUEUE_SCHEMA}.version SET version = version`,
      `INSERT INTO ${QUEUE_SCHEMA}.version (version) VALUES (0)`,
      `DELETE FROM ${QUEUE_SCHEMA}.version`,
    ]) {
      const client = await app.connect();
      try {
        await client.query('BEGIN');
        const error = await client.query(sql).catch((e: { code?: string }) => e);
        expect((error as { code?: string }).code).toBe('42501');
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    }
  });

  it('vẫn có DML trên bảng job (đọc bảng hàng đợi)', async () => {
    const r = await app.query(`SELECT count(*)::int AS n FROM ${QUEUE_SCHEMA}.job`);
    expect(r.rows[0].n).toBeGreaterThanOrEqual(0);
  });
});
