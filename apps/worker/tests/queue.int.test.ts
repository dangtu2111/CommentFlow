import { randomUUID } from 'node:crypto';
import { createDb, type FlowDb, sql } from '@flow/db';
import { aiUsage } from '@flow/db/schema/cf';
import { workspaces } from '@flow/db/schema/core';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createPingHandler } from '../src/jobs/ping';
import { systemJob, workspaceJob } from '../src/jobs/run-job';
import { createBoss } from '../src/queue/boss';
import { SYSTEM_PING_QUEUE } from '../src/queue/definitions';
import { TEST_SYSTEM_QUEUE, TEST_WORKSPACE_QUEUE } from './global-setup';

let db: FlowDb;
let boss: PgBoss;
const quiet = { error: () => {}, info: () => {} };

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Thiếu TEST_DATABASE_URL');
  db = createDb({ connectionString: url, max: 5 });
  boss = createBoss(url, quiet); // role cf_app: migrate=false, createSchema=false
  await boss.start();
});
afterAll(async () => {
  await boss.stop({ graceful: false });
  await db.close();
});

const waitFor = async (predicate: () => boolean | Promise<boolean>, ms = 15_000) => {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > ms) throw new Error(`hết ${ms}ms mà chưa đạt điều kiện`);
    await new Promise((r) => setTimeout(r, 100));
  }
};

const FAST = { pollingIntervalSeconds: 0.5 };

async function newWorkspace(): Promise<string> {
  const id = randomUUID();
  await db.withWorkspace(id, (tx) =>
    tx.insert(workspaces).values({ id, name: 'Shop Job', slug: `shop-job-${id}` }),
  );
  return id;
}

describe('pg-boss với role ứng dụng (cf_app)', () => {
  it('system.ping: job vào hàng đợi được worker xử lý ĐÚNG MỘT LẦN và hoàn tất', async () => {
    let handled = 0;
    const logger = { info: () => void handled++ };
    await boss.work(SYSTEM_PING_QUEUE, FAST, createPingHandler(db, logger));

    const id = await boss.send(SYSTEM_PING_QUEUE, { message: 'xin chào' });
    expect(id).toBeTruthy();
    await waitFor(() => handled >= 1);
    // Chờ thêm để chắc chắn không bị xử lý lặp.
    await new Promise((r) => setTimeout(r, 2500));
    expect(handled).toBe(1);
    await waitFor(
      async () => (await boss.getJobById(SYSTEM_PING_QUEUE, id as string))?.state === 'completed',
    );
  });

  it('job theo workspace chạy trong ngữ cảnh RLS: ghi ai_usage đúng workspace, không lẫn', async () => {
    const [wsA, wsB] = [await newWorkspace(), await newWorkspace()];
    const schema = z.object({ workspaceId: z.uuid(), step: z.string() });
    await boss.work(
      TEST_WORKSPACE_QUEUE,
      FAST,
      workspaceJob({
        db,
        schema,
        handler: async ({ tx, payload, workspaceId }) => {
          await tx.insert(aiUsage).values({ workspaceId, step: payload.step, model: 'mock-llm' });
        },
      }),
    );
    await boss.send(TEST_WORKSPACE_QUEUE, { workspaceId: wsA, step: 'job-a' });
    await boss.send(TEST_WORKSPACE_QUEUE, { workspaceId: wsB, step: 'job-b' });
    // Chờ tới khi dữ liệu THỰC SỰ hiện ra ở cả hai workspace: biến đếm tăng trong handler trước khi giao dịch
    // COMMIT, nên chỉ đếm biến đó làm test đọc sớm và chập chờn.
    const readRows = (workspaceId: string) =>
      db.withWorkspace(workspaceId, (tx) => tx.select().from(aiUsage));
    await waitFor(async () => (await readRows(wsA)).length > 0 && (await readRows(wsB)).length > 0);

    const rowsA = await readRows(wsA);
    const rowsB = await readRows(wsB);
    expect(rowsA.map((r) => r.step)).toEqual(['job-a']);
    expect(rowsB.map((r) => r.step)).toEqual(['job-b']);
  });

  it('job theo workspace THIẾU workspaceId: handler không chạy, job kết thúc ở trạng thái failed', async () => {
    let ran = false;
    await boss.work(
      TEST_WORKSPACE_QUEUE,
      FAST,
      workspaceJob({
        db,
        schema: z.object({ workspaceId: z.uuid() }),
        handler: async () => {
          ran = true;
        },
      }),
    );
    const id = (await boss.send(TEST_WORKSPACE_QUEUE, { khong: 'co workspaceId' })) as string;
    await waitFor(
      async () => (await boss.getJobById(TEST_WORKSPACE_QUEUE, id))?.state === 'failed',
    );
    expect(ran).toBe(false);
  });

  it('job hệ thống chỉ chạm bảng hệ thống: không đọc được dữ liệu nghiệp vụ (ai_usage → 0 dòng)', async () => {
    const wsA = await newWorkspace();
    await db.withWorkspace(wsA, (tx) =>
      tx.insert(aiUsage).values({ workspaceId: wsA, step: 'rieng-cua-a', model: 'm' }),
    );
    let seen: number | undefined;
    await boss.work(
      TEST_SYSTEM_QUEUE,
      FAST,
      systemJob({
        db,
        schema: z.object({}),
        handler: async ({ tx }) => {
          seen = (await tx.select().from(aiUsage)).length;
        },
      }),
    );
    await boss.send(TEST_SYSTEM_QUEUE, {});
    await waitFor(() => seen !== undefined);
    expect(seen).toBe(0);
  });

  it('cf_app không có quyền DDL trên schema pgboss (không tạo/xóa bảng)', async () => {
    await expect(
      db.system.execute(sql`create table pgboss.bang_tan_cong (id int)`),
    ).rejects.toSatisfy(
      (e) =>
        ((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code) ===
        '42501',
    );
  });
});
