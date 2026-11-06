import { describe, expect, it } from 'vitest';
import { buildUsageMeterView } from './usage-meter-view';

describe('FR-090 buildUsageMeterView — đồng hồ lượt + cảnh báo 80%', () => {
  it('FR-090 dưới 80% → ok, không cảnh báo', () => {
    const view = buildUsageMeterView({ used: 79, limit: 100 });
    expect(view).toMatchObject({
      level: 'ok',
      percent: 79,
      used: 79,
      capacity: 100,
      remaining: 21,
    });
    expect(view.showUpgrade).toBe(false);
  });

  it('FR-090 đúng 80% → warning và gợi ý mua thêm/nâng gói', () => {
    const view = buildUsageMeterView({ used: 80, limit: 100 });
    expect(view.level).toBe('warning');
    expect(view.showUpgrade).toBe(true);
  });

  it('FR-090 hết lượt → blocked, thanh đầy 100%, đề xuất mua thêm/nâng gói', () => {
    const view = buildUsageMeterView({ used: 100, limit: 100 });
    expect(view).toMatchObject({ level: 'blocked', percent: 100, remaining: 0, showUpgrade: true });
  });

  it('FR-090 dùng vượt hạn mức vẫn hiển thị đã dùng thật nhưng thanh không quá 100%', () => {
    const view = buildUsageMeterView({ used: 130, limit: 100 });
    expect(view.used).toBe(130);
    expect(view.percent).toBe(100);
  });

  it('FR-090 lượt mua thêm cộng vào hạn mức', () => {
    const view = buildUsageMeterView({ used: 100, limit: 100, addon: 100 });
    expect(view).toMatchObject({ level: 'ok', percent: 50, capacity: 200, remaining: 100 });
  });

  it('FR-090 hạn mức 0 → blocked', () => {
    expect(buildUsageMeterView({ used: 0, limit: 0 }).level).toBe('blocked');
  });
});
