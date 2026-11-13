import { READINESS_SAMPLE_QUESTIONS, type ReadinessTopic } from '@flow/ai';
import { describe, expect, it } from 'vitest';
import {
  bandOf,
  coachSteps,
  filterLabResults,
  labAccuracy,
  labCounts,
  PILLAR_OF_TOPIC,
  pillarsOf,
  pointsToReady,
} from './readiness-lab';

const samples = (answerable: (topic: ReadinessTopic) => boolean) =>
  READINESS_SAMPLE_QUESTIONS.map((q) => ({
    id: q.id,
    topic: q.topic,
    answerable: answerable(q.topic),
  }));

describe('bandOf / pointsToReady', () => {
  it('≤ 50 chưa an toàn; 51+ cơ bản; ready → sẵn sàng; thiếu điểm = ngưỡng − điểm', () => {
    expect(bandOf({ score: 40, ready: false, minPercent: 80 })).toBe('unsafe');
    expect(bandOf({ score: 50, ready: false, minPercent: 80 })).toBe('unsafe');
    expect(bandOf({ score: 51, ready: false, minPercent: 80 })).toBe('basic');
    expect(bandOf({ score: 95, ready: false, minPercent: 80 })).toBe('basic'); // đủ điểm nhưng thiếu mục bắt buộc
    expect(bandOf({ score: 85, ready: true, minPercent: 80 })).toBe('ready');
    expect(pointsToReady({ score: 68, minPercent: 80 })).toBe(12);
    expect(pointsToReady({ score: 90, minPercent: 80 })).toBe(0);
  });
});

describe('pillarsOf', () => {
  it('mọi chủ đề thuộc đúng một trụ cột; tổng câu = 20', () => {
    const pillars = pillarsOf({ samples: samples(() => true) });
    expect(pillars.map((p) => p.total).reduce((a, b) => a + b, 0)).toBe(
      READINESS_SAMPLE_QUESTIONS.length,
    );
    for (const q of READINESS_SAMPLE_QUESTIONS) expect(PILLAR_OF_TOPIC[q.topic]).toBeDefined();
    expect(pillars.every((p) => p.percent === 100 && p.missingTopics.length === 0)).toBe(true);
  });

  it('đếm câu trả lời được và chủ đề còn thiếu theo trụ cột', () => {
    const pillars = pillarsOf({
      samples: samples((topic) => topic !== 'shipping' && topic !== 'promo'),
    });
    const policies = pillars.find((p) => p.pillar === 'policies');
    expect(policies?.missingTopics).toEqual(['shipping']);
    expect(policies?.answerable).toBe((policies?.total ?? 0) - 3);
    const faq = pillars.find((p) => p.pillar === 'faq');
    expect(faq?.percent).toBe(0);
  });
});

describe('coachSteps', () => {
  it('mục bắt buộc trước, rồi chủ đề thiếu; cắt theo giới hạn; liên kết đúng trang', () => {
    const steps = coachSteps(
      { missingRequired: ['shipping_policy'], missingTopics: ['price', 'promo', 'hours'] },
      3,
    );
    expect(steps).toHaveLength(3);
    expect(steps[0]).toEqual({
      kind: 'required',
      item: 'shipping_policy',
      href: '/app/kb/policies',
    });
    expect(steps[1]).toEqual({ kind: 'topic', topic: 'price', href: '/app/kb/catalog' });
    expect(coachSteps({ missingRequired: [], missingTopics: [] })).toEqual([]);
  });
});

describe('filterLabResults / labCounts / labAccuracy', () => {
  const rows = [
    { lastStatus: 'pass' as const, question: 'Giá áo dài?' },
    { lastStatus: 'fail' as const, question: 'Ship COD Nam Định' },
    { lastStatus: 'error' as const, question: 'Đổi size' },
    { lastStatus: null, question: 'Giờ mở cửa' },
  ];
  it('lọc theo tab (kể cả "chưa chạy") và từ khóa không phân biệt hoa thường', () => {
    expect(filterLabResults(rows, 'all', '')).toHaveLength(4);
    expect(filterLabResults(rows, 'fail', '')).toEqual([rows[1]]);
    expect(filterLabResults(rows, 'untested', '')).toEqual([rows[3]]);
    expect(filterLabResults(rows, 'all', ' ship ')).toEqual([rows[1]]);
    expect(filterLabResults(rows, 'pass', 'ship')).toEqual([]);
  });
  it('đếm theo tab', () => {
    expect(labCounts(rows)).toEqual({ all: 4, pass: 1, fail: 1, error: 1, untested: 1 });
  });
  it('tỷ lệ chính xác tính trên câu đã chạy; chưa chạy câu nào → null', () => {
    expect(labAccuracy(rows)).toBe(33);
    expect(labAccuracy([{ lastStatus: null }])).toBeNull();
    expect(labAccuracy([])).toBeNull();
  });
});
