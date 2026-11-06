import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './client';
import { listStuckOutbox } from './stuck-outbox';

const OPTIONS = { queuedAfterSeconds: 300, sendingAfterSeconds: 150, limit: 50 };

function fakeTx(rows: { workspace_id: string; request_id: string }[]) {
  const execute = vi.fn(async (_query: SQL) => ({ rows }));
  return { tx: { execute } as unknown as Database, execute };
}

describe('SEND-SWEEP/HIDE-SWEEP: listStuckOutbox (lớp gọi hàm DB)', () => {
  it('gọi cf.list_stuck_outbox với loại và ngưỡng (tham số hóa, không nối chuỗi) và đổi tên cột sang camelCase', async () => {
    const { tx, execute } = fakeTx([{ workspace_id: 'w1', request_id: 'r1' }]);
    const result = await listStuckOutbox(tx, 'hide', OPTIONS);
    expect(result).toEqual([{ workspaceId: 'w1', requestId: 'r1' }]);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as SQL);
    expect(query.sql).toContain('cf.list_stuck_outbox(');
    expect(query.params).toEqual(['hide', 300, 150, 50]);
  });

  it('không có dòng kẹt → mảng rỗng', async () => {
    const { tx } = fakeTx([]);
    expect(await listStuckOutbox(tx, 'reply', OPTIONS)).toEqual([]);
  });
});
