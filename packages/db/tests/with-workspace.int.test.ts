import { isAppError } from '@flow/shared';
import { eq, sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { aiUsage } from '../src/schema/cf';
import { createAdminPool, createAppDb, newId, seedAiUsage, seedWorkspace } from './helpers';

let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(1); // 1 kết nối duy nhất: ép dùng lại cùng kết nối để bắt rò ngữ cảnh
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  await seedAiUsage(admin, wsA, 'a-1');
  await seedAiUsage(admin, wsA, 'a-2');
  await seedAiUsage(admin, wsB, 'b-1');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('withWorkspace', () => {
  it('chỉ thấy dữ liệu của workspace đang xử lý', async () => {
    const rows = await db.withWorkspace(wsA, (tx) => tx.select().from(aiUsage));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.workspaceId === wsA)).toBe(true);

    const rowsB = await db.withWorkspace(wsB, (tx) => tx.select().from(aiUsage));
    expect(rowsB.map((r) => r.step)).toEqual(['b-1']);
  });

  it('ngoài withWorkspace (system / withSystem) bảng nghiệp vụ trả 0 dòng', async () => {
    expect(await db.system.select().from(aiUsage)).toHaveLength(0);
    expect(await db.withSystem((tx) => tx.select().from(aiUsage))).toHaveLength(0);
  });

  it('không rò ngữ cảnh sang lần dùng lại kết nối (pool có 1 kết nối)', async () => {
    await db.withWorkspace(wsA, async (tx) => {
      const res = await tx.execute(sql`select current_setting('app.workspace_id', true) as ws`);
      expect(res.rows[0]?.ws).toBe(wsA);
    });
    // Cùng kết nối, giao dịch mới, không ngữ cảnh: biến phải rỗng/NULL và RLS chặn hết.
    const after = await db.withSystem(async (tx) => {
      const setting = await tx.execute(sql`select current_setting('app.workspace_id', true) as ws`);
      const visible = await tx.select().from(aiUsage);
      return { ws: setting.rows[0]?.ws, visible: visible.length };
    });
    expect([null, '']).toContain(after.ws);
    expect(after.visible).toBe(0);
  });

  it('từ chối workspaceId/userId không phải UUID trước khi chạm DB', async () => {
    for (const bad of ['', 'abc', `${wsA}'; drop table core.users; --`, 'null']) {
      await expect(db.withWorkspace(bad, async () => 1)).rejects.toSatisfy(
        (e) => isAppError(e) && e.code === 'VALIDATION_FAILED',
      );
    }
    await expect(db.withUser('x', async () => 1)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION_FAILED',
    );
  });

  it('lỗi trong fn → rollback toàn bộ và kết nối vẫn dùng được', async () => {
    const id = newId();
    await expect(
      db.withWorkspace(wsA, async (tx) => {
        await tx.insert(aiUsage).values({ id, workspaceId: wsA, step: 'se-rollback', model: 'm' });
        throw new Error('thử rollback');
      }),
    ).rejects.toThrow('thử rollback');

    const rows = await db.withWorkspace(wsA, (tx) =>
      tx.select().from(aiUsage).where(eq(aiUsage.id, id)),
    );
    expect(rows).toHaveLength(0);
  });

  it('commit khi fn thành công', async () => {
    const id = newId();
    await db.withWorkspace(wsB, (tx) =>
      tx.insert(aiUsage).values({ id, workspaceId: wsB, step: 'commit-ok', model: 'm' }),
    );
    const rows = await db.withWorkspace(wsB, (tx) =>
      tx.select().from(aiUsage).where(eq(aiUsage.id, id)),
    );
    expect(rows).toHaveLength(1);
  });
});
