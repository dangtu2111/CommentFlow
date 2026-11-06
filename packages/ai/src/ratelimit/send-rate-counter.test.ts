import { describe, expect, it } from 'vitest';
import { createInMemorySendRateCounter, sendRateKey } from './send-rate-counter';

const NOW = new Date('2026-11-06T10:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);

describe('FR-114 sendRateKey — khóa luôn chứa workspace_id', () => {
  it('có tiền tố sys:rl:send, workspace_id và phạm vi', () => {
    expect(sendRateKey('ws-1', 'page', 'pg-9')).toBe('sys:rl:send:ws-1:page:pg-9');
  });
  it('workspace_id hoặc id rỗng/có dấu hai chấm → ném (không tạo khóa chung/đụng khóa)', () => {
    expect(() => sendRateKey('', 'page', 'p')).toThrow();
    expect(() => sendRateKey('ws', 'page', '')).toThrow();
    expect(() => sendRateKey('w:s', 'page', 'p')).toThrow();
    expect(() => sendRateKey('ws', 'page', 'p:q')).toThrow();
  });
});

describe('FR-114 createInMemorySendRateCounter — cửa sổ trượt', () => {
  it('đếm sự kiện trong cửa sổ, sự kiện cũ rơi ra (đúng biên)', async () => {
    const c = createInMemorySendRateCounter();
    await c.record('k', at(0));
    await c.record('k', at(30_000));
    expect(await c.count('k', 60_000, at(59_999))).toBe(2);
    expect(await c.count('k', 60_000, at(60_000))).toBe(1);
    expect(await c.count('k', 60_000, at(90_000))).toBe(0);
  });
  it('khóa khác nhau độc lập', async () => {
    const c = createInMemorySendRateCounter();
    await c.record('a', at(0));
    expect(await c.count('b', 60_000, at(1))).toBe(0);
  });
  it('dọn sự kiện quá cũ khi ghi (không phình bộ nhớ)', async () => {
    const c = createInMemorySendRateCounter({ retainMs: 3_600_000 });
    await c.record('k', at(0));
    await c.record('k', at(3_600_001));
    expect(await c.count('k', 10 * 3_600_000, at(3_600_002))).toBe(1);
  });
});
