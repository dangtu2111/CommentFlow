import type { FlowDb } from '@flow/db';
import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { systemJob, workspaceJob } from './run-job';

const WS = '11111111-1111-4111-8111-111111111111';

function fakeDb() {
  const calls: { kind: 'workspace' | 'job' | 'system'; workspaceId?: string }[] = [];
  const tx = { marker: 'tx' };
  const db = {
    withWorkspace: async (workspaceId: string, fn: (t: unknown) => unknown) => {
      calls.push({ kind: 'workspace', workspaceId });
      return fn(tx);
    },
    withJob: async (workspaceId: string, fn: (t: unknown) => unknown) => {
      calls.push({ kind: 'job', workspaceId });
      return fn(tx);
    },
    withSystem: async (fn: (t: unknown) => unknown) => {
      calls.push({ kind: 'system' });
      return fn(tx);
    },
  } as unknown as FlowDb;
  return { db, calls, tx };
}

const job = (data: unknown, id = 'job-1') => ({ id, name: 'q', data }) as never;

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : `KHÁC: ${String(error)}`;
  }
  return undefined;
};

describe('workspaceJob', () => {
  const schema = z.object({ workspaceId: z.uuid(), note: z.string() });

  it('chạy handler trong withJob (đường hệ thống của workspace) với workspaceId lấy từ dữ liệu job', async () => {
    const { db, calls, tx } = fakeDb();
    const seen: unknown[] = [];
    const handler = workspaceJob({
      db,
      schema,
      handler: async (ctx) => {
        seen.push(ctx);
      },
    });
    await handler([job({ workspaceId: WS, note: 'xin chào' })]);
    expect(calls).toEqual([{ kind: 'job', workspaceId: WS }]);
    expect(seen).toEqual([
      { tx, payload: { workspaceId: WS, note: 'xin chào' }, workspaceId: WS, jobId: 'job-1' },
    ]);
  });

  it('thiếu hoặc sai workspaceId → VALIDATION_FAILED, handler không chạy, không mở giao dịch', async () => {
    for (const data of [{ note: 'x' }, { workspaceId: 'abc', note: 'x' }, null, 'chuỗi']) {
      const { db, calls } = fakeDb();
      let ran = false;
      const handler = workspaceJob({
        db,
        schema,
        handler: async () => {
          ran = true;
        },
      });
      expect(await codeOf(handler([job(data)])), JSON.stringify(data)).toBe('VALIDATION_FAILED');
      expect(ran).toBe(false);
      expect(calls).toEqual([]);
    }
  });

  it('xử lý lần lượt từng job trong lô, mỗi job một giao dịch riêng', async () => {
    const { db, calls } = fakeDb();
    const handler = workspaceJob({ db, schema, handler: async () => {} });
    const other = '22222222-2222-4222-8222-222222222222';
    await handler([
      job({ workspaceId: WS, note: 'a' }, 'j1'),
      job({ workspaceId: other, note: 'b' }, 'j2'),
    ]);
    expect(calls).toEqual([
      { kind: 'job', workspaceId: WS },
      { kind: 'job', workspaceId: other },
    ]);
  });

  it('lỗi của handler được ném lại (để pg-boss đánh dấu thất bại/thử lại)', async () => {
    const { db } = fakeDb();
    const handler = workspaceJob({
      db,
      schema,
      handler: async () => {
        throw new Error('hỏng');
      },
    });
    await expect(handler([job({ workspaceId: WS, note: 'x' })])).rejects.toThrow('hỏng');
  });
});

describe('systemJob', () => {
  it('chạy handler trong withSystem (không có workspace)', async () => {
    const { db, calls, tx } = fakeDb();
    const seen: unknown[] = [];
    const handler = systemJob({
      db,
      schema: z.object({ message: z.string() }),
      handler: async (ctx) => {
        seen.push(ctx);
      },
    });
    await handler([job({ message: 'ping' })]);
    expect(calls).toEqual([{ kind: 'system' }]);
    expect(seen).toEqual([{ tx, payload: { message: 'ping' }, jobId: 'job-1' }]);
  });

  it('payload sai schema → VALIDATION_FAILED và handler không chạy', async () => {
    const { db, calls } = fakeDb();
    let ran = false;
    const handler = systemJob({
      db,
      schema: z.object({ message: z.string() }),
      handler: async () => {
        ran = true;
      },
    });
    expect(await codeOf(handler([job({ message: 5 })]))).toBe('VALIDATION_FAILED');
    expect(ran).toBe(false);
    expect(calls).toEqual([]);
  });
});
