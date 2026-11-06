import { describe, expect, it, vi } from 'vitest';
import { createValkeyStore } from './valkey';

describe('createValkeyStore (đơn vị, Redis giả)', () => {
  it('hit gọi một lệnh eval nguyên tử với khóa + cửa sổ và trả đếm/TTL', async () => {
    const evalFn = vi.fn(async () => [3, 42]);
    const store = createValkeyStore({ eval: evalFn, del: vi.fn() });
    expect(await store.hit('k', 60)).toEqual({ count: 3, ttlSeconds: 42 });
    expect(evalFn).toHaveBeenCalledWith(expect.stringContaining('INCR'), 1, 'k', 60);
  });

  it('TTL âm được nâng lên tối thiểu 1 giây; số dạng chuỗi được ép về số', async () => {
    const store = createValkeyStore({ eval: vi.fn(async () => ['2', '-1']), del: vi.fn() });
    expect(await store.hit('k', 60)).toEqual({ count: 2, ttlSeconds: 1 });
  });

  it('reset xóa các khóa; danh sách rỗng thì không gọi del', async () => {
    const del = vi.fn(async () => 2);
    const store = createValkeyStore({ eval: vi.fn(), del });
    await store.reset([]);
    expect(del).not.toHaveBeenCalled();
    await store.reset(['a', 'b']);
    expect(del).toHaveBeenCalledWith('a', 'b');
  });
});
