import { describe, expect, it, vi } from 'vitest';
import { createReplyCapService, parseReplyCap } from './reply-cap-settings';

const ctx = { workspaceId: 'ws1', userId: 'u1' };

describe('FR-167 — Owner chỉnh trần câu AI (1–5)', () => {
  it('chỉ nhận số nguyên 1–5; mọi thứ khác → null', () => {
    for (const ok of ['1', '2', '3', '4', '5', ' 3 '])
      expect(parseReplyCap(ok)).toBe(Number(ok.trim()));
    for (const bad of [
      '0',
      '6',
      '10',
      '-1',
      '2.5',
      '1e1',
      '',
      ' ',
      'abc',
      '03',
      null,
      undefined,
      3,
      {},
    ]) {
      expect(parseReplyCap(bad as never), String(bad)).toBeNull();
    }
  });

  it('save: giá trị hợp lệ → ghi bằng withActor của CHÍNH Owner/workspace; không hợp lệ → không chạm DB', async () => {
    const calls: Array<[string, string]> = [];
    const withActor = vi.fn(
      async (ws: string, user: string, fn: (tx: never) => Promise<unknown>) => {
        calls.push([ws, user]);
        return fn({ execute: vi.fn(async () => ({ rows: [] })) } as never);
      },
    );
    const svc = createReplyCapService({ withActor } as never);
    expect(await svc.save(ctx, '4')).toEqual({ ok: true, value: 4 });
    expect(calls).toEqual([['ws1', 'u1']]);
    expect(await svc.save(ctx, '9')).toEqual({ ok: false });
    expect(await svc.save(ctx, '0')).toEqual({ ok: false });
    expect(withActor).toHaveBeenCalledTimes(1);
  });

  it('load: đọc giá trị qua withActor (mặc định 3 khi chưa lưu do tầng DB)', async () => {
    const withActor = vi.fn(async (_ws: string, _u: string, fn: (tx: never) => Promise<unknown>) =>
      fn({ execute: vi.fn(async () => ({ rows: [{ v: 2 }] })) } as never),
    );
    expect(await createReplyCapService({ withActor } as never).load(ctx)).toBe(2);
  });
});
