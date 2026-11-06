import { describe, expect, it } from 'vitest';
import { evaluateFlag, type FlagRow, rolloutBucket } from './evaluate';

const WS_A = '11111111-1111-4111-8111-111111111111';

const flag = (overrides: Partial<FlagRow> = {}): FlagRow => ({
  key: 'cf.thu',
  kind: 'release',
  defaultOn: false,
  rolloutPercent: 0,
  plans: null,
  ...overrides,
});

describe('FR-117 evaluateFlag — thứ tự quyết định (docs/09 §10)', () => {
  it('1. override theo workspace thắng gói/rollout/default_on (cả bật và tắt) với flag thường', () => {
    expect(evaluateFlag({ flag: flag({ defaultOn: false }), override: true, context: {} })).toBe(
      true,
    );
    expect(evaluateFlag({ flag: flag({ defaultOn: true }), override: false, context: {} })).toBe(
      false,
    );
    expect(
      evaluateFlag({
        flag: flag({ plans: ['pro'], defaultOn: false }),
        override: true,
        context: { workspaceId: WS_A, plan: 'free' },
      }),
    ).toBe(true);
  });

  it('2. kill_switch toàn hệ thống ĐANG CHẶN (default_on = false) → tắt; override enabled=true KHÔNG bật lại được', () => {
    const blocking = flag({
      kind: 'kill_switch',
      defaultOn: false,
      rolloutPercent: 100,
      plans: ['pro'],
    });
    expect(evaluateFlag({ flag: blocking, context: { workspaceId: WS_A, plan: 'pro' } })).toBe(
      false,
    );
    expect(evaluateFlag({ flag: blocking, override: true, context: { workspaceId: WS_A } })).toBe(
      false,
    );
    expect(evaluateFlag({ flag: blocking, override: false, context: { workspaceId: WS_A } })).toBe(
      false,
    );
  });

  it('2b. kill_switch KHÔNG chặn (default_on = true): bật; override enabled=false vẫn tắt được riêng workspace đó', () => {
    const running = flag({ kind: 'kill_switch', defaultOn: true, plans: ['pro'] });
    // Bỏ qua gói và rollout: kill_switch chỉ là công tắc toàn hệ thống.
    expect(evaluateFlag({ flag: running, context: { workspaceId: WS_A, plan: 'free' } })).toBe(
      true,
    );
    expect(evaluateFlag({ flag: running, override: true, context: {} })).toBe(true);
    expect(evaluateFlag({ flag: running, override: false, context: { workspaceId: WS_A } })).toBe(
      false,
    );
  });

  it('3. gói cước: flag có plans chỉ bật cho workspace thuộc gói đó', () => {
    const f = flag({ kind: 'plan', defaultOn: true, plans: ['pro', 'agency'] });
    expect(evaluateFlag({ flag: f, context: { plan: 'pro' } })).toBe(true);
    expect(evaluateFlag({ flag: f, context: { plan: 'free' } })).toBe(false);
    expect(evaluateFlag({ flag: f, context: {} })).toBe(false); // không biết gói → tắt
  });

  it('plans rỗng hoặc null: không ràng buộc theo gói', () => {
    expect(evaluateFlag({ flag: flag({ defaultOn: true, plans: [] }), context: {} })).toBe(true);
    expect(evaluateFlag({ flag: flag({ defaultOn: true, plans: null }), context: {} })).toBe(true);
  });

  it('4. rollout: 100% bật cho mọi workspace, 0% không bật ai', () => {
    expect(
      evaluateFlag({ flag: flag({ rolloutPercent: 100 }), context: { workspaceId: WS_A } }),
    ).toBe(true);
    expect(
      evaluateFlag({ flag: flag({ rolloutPercent: 0 }), context: { workspaceId: WS_A } }),
    ).toBe(false);
  });

  it('rollout ổn định: cùng workspace + flag luôn cho cùng kết quả; theo đúng bucket', () => {
    const f = flag({ rolloutPercent: 50 });
    const results = new Set(
      Array.from({ length: 20 }, () => evaluateFlag({ flag: f, context: { workspaceId: WS_A } })),
    );
    expect(results.size).toBe(1);
    const inBucket = rolloutBucket('cf.thu', WS_A) < 50;
    expect(evaluateFlag({ flag: f, context: { workspaceId: WS_A } })).toBe(inBucket);
  });

  it('rollout xấp xỉ đúng tỷ lệ trên nhiều workspace', () => {
    const f = flag({ rolloutPercent: 30 });
    let on = 0;
    const total = 2000;
    for (let i = 0; i < total; i++) {
      const ws = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      if (evaluateFlag({ flag: f, context: { workspaceId: ws } })) on++;
    }
    expect(on / total).toBeGreaterThan(0.25);
    expect(on / total).toBeLessThan(0.35);
  });

  it('rollout không có workspaceId (ngữ cảnh hệ thống) → không dùng rollout, rơi về default_on', () => {
    expect(
      evaluateFlag({ flag: flag({ rolloutPercent: 100, defaultOn: false }), context: {} }),
    ).toBe(false);
  });

  it('5. default_on: bật cho mọi workspace (rollout chỉ bật THÊM, không tắt bớt)', () => {
    expect(
      evaluateFlag({
        flag: flag({ defaultOn: true, rolloutPercent: 10 }),
        context: { workspaceId: WS_A },
      }),
    ).toBe(true);
    expect(evaluateFlag({ flag: flag({ defaultOn: false }), context: { workspaceId: WS_A } })).toBe(
      false,
    );
  });
});

describe('rolloutBucket', () => {
  it('luôn trong [0, 100) và phụ thuộc cả key lẫn workspace', () => {
    for (let i = 0; i < 200; i++) {
      const bucket = rolloutBucket(`k${i}`, WS_A);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
    expect(rolloutBucket('a', WS_A)).not.toBe(rolloutBucket('b', WS_A) + 1000);
    const buckets = new Set(Array.from({ length: 50 }, (_, i) => rolloutBucket(`flag-${i}`, WS_A)));
    expect(buckets.size).toBeGreaterThan(10);
  });
});
