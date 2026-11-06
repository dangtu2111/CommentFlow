import { AppError } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  buildExactCacheKey,
  type CachedAnswer,
  createMemoryCacheStore,
  type ExactCacheKeyInput,
  lookupExactCache,
  storeExactCache,
} from './exact-cache';

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';

const keyInput = (over: Partial<ExactCacheKeyInput> = {}): ExactCacheKeyInput => ({
  workspaceId: WS_A,
  postId: 'post-1',
  kbVersion: 3,
  lang: 'vi',
  normalizedText: 'ao nay gia bao nhieu',
  ...over,
});

const answer = (over: Partial<CachedAnswer> = {}): CachedAnswer => ({
  reply: 'Áo này giá 250.000đ ạ.',
  variants: ['Dạ áo này 250.000đ ạ.'],
  lang: 'vi',
  sourceIds: ['s1'],
  cacheable: true,
  ...over,
});

describe('FR-026 buildExactCacheKey (khóa cache khớp chính xác)', () => {
  it('có workspace_id, kb_version, bài và băm; không chứa văn bản thô', () => {
    const key = buildExactCacheKey(keyInput());
    expect(key).toMatch(new RegExp(`^cf:${WS_A}:cache:exact:3:post-1:[0-9a-f]{64}$`));
    expect(key).not.toContain('gia bao nhieu');
  });

  it('bài trống → dấu "-"; cùng đầu vào → cùng khóa', () => {
    const a = buildExactCacheKey(keyInput({ postId: null }));
    expect(a).toContain(':cache:exact:3:-:');
    expect(buildExactCacheKey(keyInput({ postId: null }))).toBe(a);
  });

  it('khác workspace / bài / kb_version / ngôn ngữ / câu → khóa khác', () => {
    const base = buildExactCacheKey(keyInput());
    const others = [
      keyInput({ workspaceId: WS_B }),
      keyInput({ postId: 'post-2' }),
      keyInput({ postId: null }),
      keyInput({ kbVersion: 4 }),
      keyInput({ lang: 'en' }),
      keyInput({ normalizedText: 'ao nay con khong' }),
    ].map(buildExactCacheKey);
    for (const k of others) expect(k).not.toBe(base);
    expect(new Set(others).size).toBe(others.length);
  });

  it('khóa bắt đầu bằng workspace_id (xóa theo tiền tố workspace được)', () => {
    expect(buildExactCacheKey(keyInput({ workspaceId: WS_B })).startsWith(`cf:${WS_B}:`)).toBe(
      true,
    );
  });

  it('workspace_id không phải uuid / rỗng → AppError', () => {
    for (const workspaceId of ['', 'abc', `${WS_A}:x`, '*']) {
      expect(() => buildExactCacheKey(keyInput({ workspaceId }))).toThrowError(AppError);
    }
  });

  it('kb_version âm / không nguyên, câu rỗng, bài chứa ":" hoặc rỗng → từ chối', () => {
    expect(() => buildExactCacheKey(keyInput({ kbVersion: -1 }))).toThrowError(AppError);
    expect(() => buildExactCacheKey(keyInput({ kbVersion: 1.5 }))).toThrowError(AppError);
    expect(() => buildExactCacheKey(keyInput({ normalizedText: '   ' }))).toThrowError(AppError);
    expect(() => buildExactCacheKey(keyInput({ postId: 'a:b' }))).toThrowError(AppError);
    expect(() => buildExactCacheKey(keyInput({ postId: '' }))).toThrowError(AppError);
  });

  it('kb_version 0 (chưa xuất bản) hợp lệ', () => {
    expect(buildExactCacheKey(keyInput({ kbVersion: 0 }))).toContain(':cache:exact:0:');
  });
});

function setup(revs: Record<string, number> = { p1: 1 }) {
  const store = createMemoryCacheStore();
  const getCurrentRevs = vi.fn(async (_ws: string, ids: readonly string[]) =>
    Object.fromEntries(ids.filter((id) => id in revs).map((id) => [id, revs[id] as number])),
  );
  return { store, getCurrentRevs, deps: { store, getCurrentRevs, enabled: true } };
}

describe('FR-026 FR-135 lookupExactCache / storeExactCache', () => {
  it('chưa có → miss absent', async () => {
    const { deps } = setup();
    expect(await lookupExactCache(deps, keyInput())).toEqual({ status: 'miss', reason: 'absent' });
  });

  it('ghi rồi đọc, rev khớp → hit trả đúng câu trả lời và product_revs', async () => {
    const { deps, getCurrentRevs } = setup();
    await storeExactCache(deps, keyInput(), answer(), { p1: 1 });
    const res = await lookupExactCache(deps, keyInput());
    expect(res).toMatchObject({ status: 'hit', answer: answer(), productRevs: { p1: 1 } });
    expect(getCurrentRevs).toHaveBeenCalledWith(WS_A, ['p1']);
  });

  it('FR-135 giá đổi (rev lệch) → miss stale và xóa khóa; không trả giá cũ', async () => {
    const live: Record<string, number> = { p1: 1 };
    const { deps, store } = setup(live);
    await storeExactCache(deps, keyInput(), answer(), { p1: 1 });
    live.p1 = 2;
    expect(await lookupExactCache(deps, keyInput())).toEqual({ status: 'miss', reason: 'stale' });
    expect(await store.get(buildExactCacheKey(keyInput()))).toBeNull();
    expect(await lookupExactCache(deps, keyInput())).toEqual({ status: 'miss', reason: 'absent' });
  });

  it('FR-135 sản phẩm đã dùng không còn → stale', async () => {
    const { deps } = setup({});
    await storeExactCache(deps, keyInput(), answer(), { p1: 1 });
    expect(await lookupExactCache(deps, keyInput())).toEqual({ status: 'miss', reason: 'stale' });
  });

  it('cache không dùng sản phẩm → hit, không đọc rev', async () => {
    const { deps, getCurrentRevs } = setup();
    await storeExactCache(deps, keyInput(), answer(), {});
    expect((await lookupExactCache(deps, keyInput())).status).toBe('hit');
    expect(getCurrentRevs).not.toHaveBeenCalled();
  });

  it('workspace khác không thấy cache của A; kb_version mới → miss', async () => {
    const { deps } = setup();
    await storeExactCache(deps, keyInput(), answer(), {});
    expect(await lookupExactCache(deps, keyInput({ workspaceId: WS_B }))).toEqual({
      status: 'miss',
      reason: 'absent',
    });
    expect(await lookupExactCache(deps, keyInput({ kbVersion: 4 }))).toEqual({
      status: 'miss',
      reason: 'absent',
    });
  });

  it('cùng câu ở hai workspace → mỗi bên đọc đúng câu trả lời của mình', async () => {
    const { deps } = setup();
    await storeExactCache(deps, keyInput({ workspaceId: WS_B }), answer({ reply: 'của B' }), {});
    await storeExactCache(deps, keyInput(), answer({ reply: 'của A' }), {});
    expect(await lookupExactCache(deps, keyInput())).toMatchObject({
      status: 'hit',
      answer: { reply: 'của A' },
    });
    expect(await lookupExactCache(deps, keyInput({ workspaceId: WS_B }))).toMatchObject({
      status: 'hit',
      answer: { reply: 'của B' },
    });
  });

  it('cờ cf.cache.answers tắt → đọc miss disabled, ghi không làm gì', async () => {
    const { store, getCurrentRevs } = setup();
    const off = { store, getCurrentRevs, enabled: false };
    expect(await storeExactCache(off, keyInput(), answer(), {})).toEqual({
      stored: false,
      reason: 'disabled',
    });
    expect(await lookupExactCache(off, keyInput())).toEqual({ status: 'miss', reason: 'disabled' });
    const on = { store, getCurrentRevs, enabled: true };
    expect(await lookupExactCache(on, keyInput())).toEqual({ status: 'miss', reason: 'absent' });
  });

  it('giá trị hỏng (JSON sai / sai schema) → miss corrupt và xóa khóa, không ném', async () => {
    const { deps, store } = setup();
    const key = buildExactCacheKey(keyInput());
    await store.set(key, '{không phải json', 60);
    expect(await lookupExactCache(deps, keyInput())).toEqual({ status: 'miss', reason: 'corrupt' });
    expect(await store.get(key)).toBeNull();
    await store.set(key, JSON.stringify({ answer: { reply: 1 }, productRevs: {} }), 60);
    expect(await lookupExactCache(deps, keyInput())).toEqual({ status: 'miss', reason: 'corrupt' });
  });

  it('câu trả lời không cacheable (chuyển người/khiếu nại) → không ghi', async () => {
    const { deps, store } = setup();
    const res = await storeExactCache(deps, keyInput(), answer({ cacheable: false }), {});
    expect(res).toEqual({ stored: false, reason: 'not_cacheable' });
    expect(await store.get(buildExactCacheKey(keyInput()))).toBeNull();
  });

  it('ghi kèm TTL (mặc định 24 giờ, ghi đè được) và trả stored:true', async () => {
    const set = vi.fn(async (_key: string, _value: string, _ttl: number) => undefined);
    const store = { get: async () => null, set, del: async () => undefined };
    const deps = { store, getCurrentRevs: async () => ({}), enabled: true };
    expect(await storeExactCache(deps, keyInput(), answer(), {})).toEqual({ stored: true });
    expect(set.mock.calls[0]?.[2]).toBe(86_400);
    await storeExactCache({ ...deps, ttlSeconds: 60 }, keyInput(), answer(), {});
    expect(set.mock.calls[1]?.[2]).toBe(60);
  });

  it('bản bộ nhớ: hết hạn theo TTL', async () => {
    let now = 1_000;
    const store = createMemoryCacheStore(() => now);
    await store.set('k', 'v', 10);
    expect(await store.get('k')).toBe('v');
    now += 10_001;
    expect(await store.get('k')).toBeNull();
    await store.del('k');
  });
});
