import { describe, expect, it } from 'vitest';
import { createInMemorySendRateCounter, type SendRateCounter } from './send-rate-counter';
import { DEFAULT_SEND_RATE_LIMITS } from './send-rate-limit';
import { createSendRateService } from './send-rate-service';

const NOW = new Date('2026-11-06T10:00:00Z');
const target = (over: Record<string, unknown> = {}) => ({
  workspaceId: 'ws-1',
  pageId: 'pg-1',
  postId: 'post-1',
  mode: 'auto' as const,
  replyText: 'Dạ shop còn hàng ạ',
  now: NOW,
  ...over,
});
const on = { enabled: true, limits: DEFAULT_SEND_RATE_LIMITS };

describe('FR-114 createSendRateService.snapshot — dựng `rate` cho R9', () => {
  it('cờ tắt → null và không đụng bộ đếm', async () => {
    let touched = false;
    const counter: SendRateCounter = {
      count: async () => {
        touched = true;
        return 0;
      },
      record: async () => {
        touched = true;
      },
    };
    const s = createSendRateService({ counter, config: { ...on, enabled: false } });
    expect(await s.snapshot(target())).toBeNull();
    expect(touched).toBe(false);
  });
  it('chưa gửi gì → còn đủ lượt, không hold', async () => {
    const s = createSendRateService({ counter: createInMemorySendRateCounter(), config: on });
    expect(await s.snapshot(target())).toEqual({ remaining: 30 });
  });
  it('5 câu giống hệt (khác dấu câu/hoa thường) → câu thứ 6 hold repeat; nội dung khác thì không', async () => {
    const s = createSendRateService({ counter: createInMemorySendRateCounter(), config: on });
    for (let i = 0; i < 5; i++) {
      await s.record(target({ replyText: i % 2 ? 'DẠ shop còn hàng ạ!!' : 'Dạ shop còn hàng ạ' }));
    }
    expect(await s.snapshot(target())).toMatchObject({ hold: 'rate_limited_repeat' });
    expect(await s.snapshot(target({ replyText: 'Nội dung khác hẳn' }))).not.toHaveProperty('hold');
  });
  it('30 câu trong phút → remaining 0 (hoãn)', async () => {
    const s = createSendRateService({ counter: createInMemorySendRateCounter(), config: on });
    for (let i = 0; i < 30; i++) await s.record(target({ replyText: `câu ${i}` }));
    expect(await s.snapshot(target())).toMatchObject({ remaining: 0 });
  });
  it('20 câu tự gửi cùng bài/10 phút → hold post; bài khác thì không', async () => {
    const s = createSendRateService({ counter: createInMemorySendRateCounter(), config: on });
    for (let i = 0; i < 20; i++)
      await s.record(target({ replyText: `c${i}`, pageId: `pg-${i % 3}` }));
    // Khác Page nên không dính giới hạn Page; cùng bài nên dính giới hạn bài.
    expect(await s.snapshot(target({ pageId: 'pg-9' }))).toMatchObject({
      hold: 'rate_limited_post',
    });
    expect(await s.snapshot(target({ pageId: 'pg-9', postId: 'post-2' }))).not.toHaveProperty(
      'hold',
    );
  });
  it('câu do người gửi: đếm vào Page và nội dung lặp, nhưng không vào bộ đếm tự gửi/bài', async () => {
    const s = createSendRateService({ counter: createInMemorySendRateCounter(), config: on });
    for (let i = 0; i < 20; i++) await s.record(target({ mode: 'human', replyText: `khác ${i}` }));
    expect(await s.snapshot(target({ mode: 'human' }))).toEqual({ remaining: 10 });
    expect(await s.snapshot(target())).not.toHaveProperty('hold');
    for (let i = 0; i < 5; i++) await s.record(target({ mode: 'human', replyText: 'giống nhau' }));
    expect(await s.snapshot(target({ replyText: 'giống nhau' }))).toMatchObject({
      hold: 'rate_limited_repeat',
    });
  });
  it('workspace khác không ảnh hưởng nhau (cùng pageId)', async () => {
    const s = createSendRateService({ counter: createInMemorySendRateCounter(), config: on });
    for (let i = 0; i < 30; i++) await s.record(target({ replyText: `c${i}` }));
    expect(await s.snapshot(target({ workspaceId: 'ws-2' }))).toEqual({ remaining: 30 });
  });
  it('mức dùng Meta App ≥ 90% → tự gửi bị hoãn (rate_limited_app), người bấm qua', async () => {
    const s = createSendRateService({
      counter: createInMemorySendRateCounter(),
      config: on,
      appUsage: () => 92,
    });
    expect(await s.snapshot(target())).toEqual({ remaining: 15, hold: 'rate_limited_app' }); // ≥75%: Page/phút của tự gửi giảm nửa
    expect(await s.snapshot(target({ mode: 'human' }))).toEqual({ remaining: 30 });
  });
  it('bộ đếm lỗi → đóng: remaining 0 (hoãn), không ném, không cho qua', async () => {
    const counter: SendRateCounter = {
      count: async () => {
        throw new Error('redis down');
      },
      record: async () => {},
    };
    const s = createSendRateService({ counter, config: on });
    expect(await s.snapshot(target())).toEqual({ remaining: 0 });
  });
  it('record không lưu chữ gốc: khóa chỉ chứa sha256, luôn có workspace_id', async () => {
    const keys: string[] = [];
    const counter: SendRateCounter = {
      count: async () => 0,
      record: async (k) => {
        keys.push(k);
      },
    };
    await createSendRateService({ counter, config: on }).record(
      target({ replyText: 'SĐT 0912345678' }),
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some((k) => k.includes('0912345678') || k.includes('SĐT'))).toBe(false);
    expect(keys.every((k) => k.startsWith('sys:rl:send:ws-1:'))).toBe(true);
  });
  it('record lỗi bộ đếm → không ném (đã gửi rồi), báo qua onError', async () => {
    const errors: unknown[] = [];
    const counter: SendRateCounter = {
      count: async () => 0,
      record: async () => {
        throw new Error('x');
      },
    };
    const s = createSendRateService({ counter, config: on, onError: (e) => errors.push(e) });
    await expect(s.record(target())).resolves.toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
  });
  it('đầu vào hỏng (workspaceId rỗng) → snapshot đóng, record không ném', async () => {
    const s = createSendRateService({ counter: createInMemorySendRateCounter(), config: on });
    expect(await s.snapshot(target({ workspaceId: '' }))).toEqual({ remaining: 0 });
    const errors: unknown[] = [];
    const s2 = createSendRateService({
      counter: createInMemorySendRateCounter(),
      config: on,
      onError: (e) => errors.push(e),
    });
    await expect(
      s2.record(target({ workspaceId: '', replyText: 'SĐT 0912345678' })),
    ).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(String((errors[0] as Error).message)).not.toContain('0912345678');
    await expect(s.record(target({ workspaceId: '' }))).resolves.toBeUndefined();
  });
});
