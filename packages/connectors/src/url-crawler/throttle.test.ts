import { describe, expect, it } from 'vitest';
import { createHostThrottle } from './throttle';

function fakeClock() {
  let time = 1_000;
  const sleeps: number[] = [];
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
    advance: (ms: number) => {
      time += ms;
    },
    sleeps,
  };
}

describe('FR-053 createHostThrottle — giới hạn tốc độ theo host', () => {
  it('lần đầu không chờ; lần hai cùng host chờ đủ khoảng tối thiểu', async () => {
    const clock = fakeClock();
    const throttle = createHostThrottle({
      minIntervalMs: 2000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await throttle.wait('shop.example.vn');
    await throttle.wait('shop.example.vn');
    expect(clock.sleeps).toEqual([2000]);
  });

  it('chỉ chờ phần còn thiếu; đã đủ khoảng thì không chờ', async () => {
    const clock = fakeClock();
    const throttle = createHostThrottle({
      minIntervalMs: 2000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await throttle.wait('a.example.vn');
    clock.advance(1500);
    await throttle.wait('a.example.vn');
    clock.advance(5000);
    await throttle.wait('a.example.vn');
    expect(clock.sleeps).toEqual([500]);
  });

  it('host khác nhau không chặn nhau; tên host không phân biệt hoa/thường', async () => {
    const clock = fakeClock();
    const throttle = createHostThrottle({
      minIntervalMs: 2000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await throttle.wait('a.example.vn');
    await throttle.wait('b.example.vn');
    expect(clock.sleeps).toEqual([]);
    await throttle.wait('A.Example.vn');
    expect(clock.sleeps).toEqual([2000]);
  });

  it('Crawl-delay lớn hơn mặc định được tôn trọng nhưng có trần', async () => {
    const clock = fakeClock();
    const throttle = createHostThrottle({
      minIntervalMs: 1000,
      maxIntervalMs: 10_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await throttle.wait('a.example.vn', 4000);
    await throttle.wait('a.example.vn', 4000);
    await throttle.wait('a.example.vn', 60_000);
    expect(clock.sleeps).toEqual([4000, 10_000]);
  });

  it('Crawl-delay nhỏ hơn mặc định không làm giảm mặc định', async () => {
    const clock = fakeClock();
    const throttle = createHostThrottle({
      minIntervalMs: 2000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await throttle.wait('a.example.vn', 100);
    await throttle.wait('a.example.vn', 100);
    expect(clock.sleeps).toEqual([2000]);
  });

  it('hai lệnh gọi đồng thời cùng host vẫn cách nhau (đặt chỗ trước khi ngủ)', async () => {
    const clock = fakeClock();
    const throttle = createHostThrottle({
      minIntervalMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await Promise.all([
      throttle.wait('a.example.vn'),
      throttle.wait('a.example.vn'),
      throttle.wait('a.example.vn'),
    ]);
    // Đồng hồ giả tiến ngay khi "ngủ", nên lệnh thứ ba chỉ thấy phần còn thiếu; tổng thời gian trôi qua phải là 2 khoảng.
    expect(clock.sleeps).toEqual([1000, 1000]);
    expect(clock.now()).toBe(3_000);
  });

  it('dùng đồng hồ/ngủ thật khi không tiêm (khoảng 0 ms)', async () => {
    const throttle = createHostThrottle({ minIntervalMs: 0 });
    await throttle.wait('a.example.vn');
    await throttle.wait('a.example.vn');
    const slow = createHostThrottle({ minIntervalMs: 20 });
    await slow.wait('a.example.vn');
    await slow.wait('a.example.vn');
  });
});
