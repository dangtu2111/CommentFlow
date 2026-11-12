import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBoss } from '../src/queue/boss';
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
  it('đọc và UPDATE được sổ phiên bản (pg-boss ghi cột bảo trì) nhưng KHÔNG chèn/xóa dòng được (42501)', async () => {
    const read = await app.query(`SELECT version FROM ${QUEUE_SCHEMA}.version`);
    expect(read.rows.length).toBeGreaterThan(0);
    // Mỗi câu chạy trong giao dịch rồi ROLLBACK: nếu quyền hồi quy (câu thành công) thì cũng không làm hỏng sổ phiên bản của DB test.
    for (const sql of [
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

  it('HỒI QUY: pg-boss THẬT khởi động bằng cf_app (như worker) và chạy bảo trì KHÔNG báo lỗi quyền', async () => {
    const url = process.env.TEST_DATABASE_URL as string;
    const errors: string[] = [];
    const boss = createBoss(url, { error: (() => undefined) as never });
    // Bắt thông điệp THẬT (không chỉ tên lỗi) để lỗi quyền hiện đúng chữ.
    boss.on('error', (error: Error & { code?: string }) =>
      errors.push(`${error.code ?? ''} ${error.message}`),
    );
    await boss.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 6000));
    } finally {
      await boss.stop({ graceful: false });
    }
    expect(errors.filter((line) => line.includes('permission denied'))).toEqual([]);
  }, 30_000);
});
