import type { SpamRule } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import { createSpamRulesService, type SpamRuleStore } from './spam-rules';

const rule: SpamRule = { name: 'Zalo', type: 'keyword', pattern: 'zalo', action: 'mark' };
const ctx = { workspaceId: 'w1', userId: 'u1' };

const makeDb = () => {
  const withActor = vi.fn(async (_w: string, _u: string, fn: (tx: unknown) => unknown) => fn({}));
  return { withActor };
};

describe('FR-080 createSpamRulesService.preview', () => {
  it('FR-080 đọc bình luận 7 ngày của workspace qua withActor, bỏ của Page, đếm khớp', async () => {
    const db = makeDb();
    const listRecentCommentTexts = vi.fn(async () => [
      { id: 'a', text: 'ib zalo 0912345678', isOwn: false },
      { id: 'b', text: 'zalo của shop', isOwn: true },
      { id: 'c', text: 'còn hàng không', isOwn: false },
    ]);
    const svc = createSpamRulesService({
      db: db as never,
      ops: { listRecentCommentTexts } as never,
    });
    const p = await svc.preview(ctx, rule);
    expect(db.withActor).toHaveBeenCalledWith('w1', 'u1', expect.any(Function));
    expect(listRecentCommentTexts).toHaveBeenCalledWith(expect.anything(), 'w1', { days: 7 });
    expect(p).toEqual({
      matched: 1,
      total: 2,
      samples: [{ id: 'a', textMasked: 'ib zalo [sđt]' }],
    });
  });
});

describe('FR-080 createSpamRulesService.save', () => {
  it('FR-080 chưa có kho lưu (bảng rules — làn b) → unavailable, không ghi gì', async () => {
    const db = makeDb();
    const svc = createSpamRulesService({
      db: db as never,
      ops: { listRecentCommentTexts: vi.fn() } as never,
    });
    await expect(svc.save(ctx, rule)).resolves.toBe('unavailable');
    expect(db.withActor).not.toHaveBeenCalled();
  });

  it('FR-080 có kho lưu → gọi create trong withActor và trả ok', async () => {
    const db = makeDb();
    const store: SpamRuleStore = { create: vi.fn(async () => 'rule-1') };
    const svc = createSpamRulesService({
      db: db as never,
      ops: { listRecentCommentTexts: vi.fn() } as never,
      store,
    });
    await expect(svc.save(ctx, rule)).resolves.toBe('ok');
    expect(db.withActor).toHaveBeenCalledWith('w1', 'u1', expect.any(Function));
    expect(store.create).toHaveBeenCalledWith(expect.anything(), 'w1', 'u1', rule);
  });

  it('FR-080 kho báo lỗi (vd. quá 50 quy tắc) → save ném lỗi lên, không nuốt', async () => {
    const db = makeDb();
    const store: SpamRuleStore = {
      create: vi.fn(async () => {
        throw new Error('limit');
      }),
    };
    const svc = createSpamRulesService({
      db: db as never,
      ops: { listRecentCommentTexts: vi.fn() } as never,
      store,
    });
    await expect(svc.save(ctx, rule)).rejects.toThrow('limit');
  });
});
