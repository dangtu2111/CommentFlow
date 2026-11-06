import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { Database } from '../client';
import { loadReportRows, REPORT_MAX_ROWS } from './reports';

const WS = '11111111-1111-4111-8111-111111111111';
const CH = '22222222-2222-4222-8222-222222222222';
const FROM = new Date('2026-11-02T00:00:00.000Z');
const TO = new Date('2026-11-09T00:00:00.000Z');

function fakeTx(rows: unknown[]) {
  const calls: SQL[] = [];
  const tx = {
    execute: async (q: SQL) => {
      calls.push(q);
      return { rows };
    },
  } as unknown as Database;
  return { tx, calls };
}
const render = (q: SQL) => new PgDialect().sqlToQuery(q);

const raw = (i: number) => ({
  id: `c-${i}`,
  channel_id: CH,
  created_time: '2026-11-03T01:00:00.000Z',
  replied_at: i % 2 ? '2026-11-03T01:05:00.000Z' : null,
  replied_by: null,
  status: 'new',
  is_own: false,
  deleted_at: null,
});

describe('FR-083 loadReportRows', () => {
  it('chỉ đọc, ép workspace_id và khoảng thời gian bằng tham số (không nối chuỗi)', async () => {
    const { tx, calls } = fakeTx([]);
    await loadReportRows(tx, { workspaceId: WS, from: FROM, to: TO });
    const { sql: text, params } = render(calls[0]!);
    expect(text).toMatch(/^\s*SELECT/i);
    expect(text).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    expect(text).toContain('c.workspace_id = $1::uuid');
    expect(text).not.toContain('channel_id = $');
    expect(params).toEqual([WS, FROM.toISOString(), TO.toISOString(), REPORT_MAX_ROWS + 1]);
  });

  it('thêm điều kiện kênh khi có channelId', async () => {
    const { tx, calls } = fakeTx([]);
    await loadReportRows(tx, { workspaceId: WS, from: FROM, to: TO, channelId: CH });
    const { sql: text, params } = render(calls[0]!);
    expect(text).toContain('c.channel_id = $4::uuid');
    expect(params[3]).toBe(CH);
  });

  it('ánh xạ cột sang ReportCommentRow (ngày → Date) và không có truncated khi dưới trần', async () => {
    const { tx } = fakeTx([raw(1), raw(2)]);
    const res = await loadReportRows(tx, { workspaceId: WS, from: FROM, to: TO });
    expect(res.truncated).toBe(false);
    expect(res.rows[0]).toEqual({
      id: 'c-1',
      channelId: CH,
      createdTime: new Date('2026-11-03T01:00:00.000Z'),
      repliedAt: new Date('2026-11-03T01:05:00.000Z'),
      repliedBy: null,
      status: 'new',
      isOwn: false,
      deletedAt: null,
    });
    expect(res.rows[1]!.repliedAt).toBeNull();
  });

  it('vượt trần → cắt về trần và báo truncated', async () => {
    const many = Array.from({ length: REPORT_MAX_ROWS + 1 }, (_, i) => raw(i));
    const res = await loadReportRows(fakeTx(many).tx, { workspaceId: WS, from: FROM, to: TO });
    expect(res.truncated).toBe(true);
    expect(res.rows).toHaveLength(REPORT_MAX_ROWS);
  });
});
