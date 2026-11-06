import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AI_USAGE_DETAIL_DAYS,
  compactAiUsageRows,
  DATA_RETENTION_DAYS,
  isPastRetention,
  MIN_AI_USAGE_DETAIL_DAYS,
  MIN_DATA_RETENTION_DAYS,
  retentionCutoff,
} from './retention-policy';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-06T00:00:00Z');

describe('FR-126 chính sách thời hạn lưu', () => {
  it('FR-126 mặc định: dữ liệu 12 tháng (365 ngày), chi tiết ai_usage 90 ngày; cận dưới bảo vệ', () => {
    expect(DATA_RETENTION_DAYS).toBe(365);
    expect(AI_USAGE_DETAIL_DAYS).toBe(90);
    expect(MIN_DATA_RETENTION_DAYS).toBe(180);
    expect(MIN_AI_USAGE_DETAIL_DAYS).toBe(30);
  });

  it('FR-126 mốc cắt = bây giờ trừ đúng số ngày', () => {
    expect(retentionCutoff(NOW, 90).getTime()).toBe(NOW.getTime() - 90 * DAY);
  });

  it('FR-126 số ngày không hợp lệ (âm, 0, số lẻ, NaN) bị từ chối', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => retentionCutoff(NOW, bad)).toThrow();
    }
  });

  it('FR-126 (property) quá hạn khi và chỉ khi cũ hơn mốc cắt; đúng tại biên = chưa quá hạn', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: -10_000, max: 10_000 }),
        (days, offsetSec) => {
          const ts = new Date(retentionCutoff(NOW, days).getTime() + offsetSec * 1000);
          expect(isPastRetention(ts, NOW, days)).toBe(offsetSec < 0);
        },
      ),
    );
  });

  it('FR-126 (property) dữ liệu mới hơn hạn không bao giờ quá hạn; thời điểm tương lai không quá hạn', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 0, max: 1000 }),
        (days, future) => {
          expect(isPastRetention(new Date(NOW.getTime() + future * DAY), NOW, days)).toBe(false);
        },
      ),
    );
  });
});

const row = fc.record({
  workspaceId: fc.constantFrom('w1', 'w2'),
  createdAt: fc.date({
    min: new Date('2026-01-01T00:00:00Z'),
    max: new Date('2026-03-01T00:00:00Z'),
    noInvalidDate: true,
  }),
  step: fc.constantFrom('classify', 'draft'),
  model: fc.constantFrom('m1', 'm2'),
  promptVersion: fc.option(fc.constantFrom('v1', 'v2'), { nil: null }),
  cacheHit: fc.boolean(),
  inputTokens: fc.integer({ min: 0, max: 5000 }),
  outputTokens: fc.integer({ min: 0, max: 5000 }),
  cachedTokens: fc.integer({ min: 0, max: 5000 }),
  costMicroUsd: fc.integer({ min: 0, max: 1_000_000 }),
});

describe('FR-126 gộp ai_usage theo ngày (mô hình tham chiếu của cf.compact_ai_usage)', () => {
  it('FR-126 (property) bảo toàn tổng số lần gọi, token và chi phí; khóa gộp duy nhất', () => {
    fc.assert(
      fc.property(fc.array(row, { maxLength: 60 }), (rows) => {
        const out = compactAiUsageRows(rows);
        const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
        expect(out.reduce((a, r) => a + r.calls, 0)).toBe(rows.length);
        expect(out.reduce((a, r) => a + r.inputTokens, 0)).toBe(sum((r) => r.inputTokens));
        expect(out.reduce((a, r) => a + r.outputTokens, 0)).toBe(sum((r) => r.outputTokens));
        expect(out.reduce((a, r) => a + r.cachedTokens, 0)).toBe(sum((r) => r.cachedTokens));
        expect(out.reduce((a, r) => a + r.costMicroUsd, 0)).toBe(sum((r) => r.costMicroUsd));
        const keys = out.map((r) =>
          [r.workspaceId, r.day, r.step, r.model, r.promptVersion, r.cacheHit].join('|'),
        );
        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });

  it('FR-126 (property) không trộn workspace; ngày tính theo UTC; prompt_version NULL thành chuỗi rỗng', () => {
    fc.assert(
      fc.property(fc.array(row, { maxLength: 40 }), (rows) => {
        const out = compactAiUsageRows(rows);
        for (const r of out) {
          expect(r.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          const members = rows.filter(
            (x) =>
              x.workspaceId === r.workspaceId &&
              x.createdAt.toISOString().slice(0, 10) === r.day &&
              x.step === r.step &&
              x.model === r.model &&
              (x.promptVersion ?? '') === r.promptVersion &&
              x.cacheHit === r.cacheHit,
          );
          expect(members.length).toBe(r.calls);
        }
      }),
    );
  });

  it('FR-126 gộp lại bản đã gộp (chạy hai lần) vẫn bảo toàn tổng', () => {
    const a = {
      workspaceId: 'w1',
      createdAt: new Date('2026-01-01T10:00:00Z'),
      step: 'draft',
      model: 'm1',
      promptVersion: null,
      cacheHit: false,
      inputTokens: 1,
      outputTokens: 2,
      cachedTokens: 3,
      costMicroUsd: 4,
    };
    const first = compactAiUsageRows([a]);
    const second = compactAiUsageRows([a, { ...a, inputTokens: 10 }]);
    expect(first[0]?.calls).toBe(1);
    expect(second[0]).toMatchObject({
      calls: 2,
      inputTokens: 11,
      outputTokens: 4,
      costMicroUsd: 8,
    });
  });
});
