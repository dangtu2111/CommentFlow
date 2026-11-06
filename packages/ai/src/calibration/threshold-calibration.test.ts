import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_MIN_SAMPLES,
  type CalibrationSample,
  calibrateByKey,
  calibrationKey,
  draftStatusToEdited,
  suggestThreshold,
} from './threshold-calibration';

/** Fixture: n mẫu ở độ tin cậy `conf`, `edited` trong số đó bị sửa. */
function batch(n: number, conf: number, edited: number): CalibrationSample[] {
  return Array.from({ length: n }, (_, i) => ({ confidence: conf, edited: i < edited }));
}
const T = 0.85;

describe('FR-072 suggestThreshold — đủ mẫu', () => {
  it('< 50 mẫu: không đề xuất, khóa nút bật Tự động', () => {
    const r = suggestThreshold(batch(CALIBRATION_MIN_SAMPLES - 1, 0.9, 0), T);
    expect(r.action).toBe('insufficient_data');
    expect(r.suggestedThreshold).toBe(T);
    expect(r.canEnableAuto).toBe(false);
    expect(r.reason.code).toBe('insufficient_samples');
    expect(r.reason.params).toMatchObject({ sampleCount: 49, required: 50 });
  });

  it('đúng 50 mẫu sạch: đủ điều kiện, giữ ngưỡng', () => {
    const r = suggestThreshold(batch(50, 0.9, 0), T);
    expect(r.action).toBe('keep');
    expect(r.canEnableAuto).toBe(true);
    expect(r.suggestedThreshold).toBe(T);
  });
});

describe('FR-072 suggestThreshold — nâng', () => {
  it('khoảng trên có 10 mẫu, 2 sửa (20% > 10%) → nâng 0,02 kèm lý do + số liệu', () => {
    const r = suggestThreshold([...batch(10, 0.9, 2), ...batch(40, 0.5, 0)], T);
    expect(r.action).toBe('raise');
    expect(r.suggestedThreshold).toBe(0.87);
    expect(r.reason.code).toBe('raise_upper_band_edited');
    expect(r.reason.params).toMatchObject({ bandCount: 10, editRate: 0.2 });
  });

  it('đúng 10% sửa thì KHÔNG nâng (phải > 10%)', () => {
    const r = suggestThreshold([...batch(10, 0.9, 1), ...batch(40, 0.5, 0)], T);
    expect(r.action).toBe('keep');
  });

  it('khoảng trên chỉ 9 mẫu thì không đủ căn cứ để nâng', () => {
    const r = suggestThreshold([...batch(9, 0.9, 9), ...batch(41, 0.5, 0)], T);
    expect(r.action).not.toBe('raise');
  });

  it('ngưỡng tính cả điểm đúng bằng ngưỡng (≥)', () => {
    const r = suggestThreshold([...batch(10, T, 5), ...batch(40, 0.5, 0)], T);
    expect(r.action).toBe('raise');
  });

  it('không nâng quá 0,99', () => {
    const r = suggestThreshold([...batch(10, 0.995, 10), ...batch(40, 0.5, 0)], 0.99);
    expect(r.suggestedThreshold).toBeLessThanOrEqual(0.99);
  });
});

describe('FR-072 suggestThreshold — hạ', () => {
  it('khoảng dưới (0,80–0,85) có 15 mẫu, 0 sửa → hạ 0,02', () => {
    const r = suggestThreshold([...batch(15, 0.83, 0), ...batch(35, 0.95, 0)], T);
    expect(r.action).toBe('lower');
    expect(r.suggestedThreshold).toBe(0.83);
    expect(r.reason.code).toBe('lower_band_clean');
    expect(r.reason.params).toMatchObject({ bandCount: 15 });
  });

  it('14 mẫu thì chưa hạ; 15 mẫu nhưng 1 sửa thì chưa hạ', () => {
    expect(suggestThreshold([...batch(14, 0.83, 0), ...batch(36, 0.95, 0)], T).action).toBe('keep');
    expect(suggestThreshold([...batch(15, 0.83, 1), ...batch(35, 0.95, 0)], T).action).toBe('keep');
  });

  it('mẫu dưới ngưỡng quá 0,05 không tính vào khoảng dưới', () => {
    const r = suggestThreshold([...batch(15, 0.7, 0), ...batch(35, 0.95, 0)], T);
    expect(r.action).toBe('keep');
  });

  it('không bao giờ hạ dưới sàn 0,80; ở sàn → giữ + at_floor', () => {
    const r = suggestThreshold([...batch(15, 0.79, 0), ...batch(35, 0.95, 0)], 0.8);
    expect(r.action).toBe('keep');
    expect(r.suggestedThreshold).toBe(0.8);
    expect(r.reason.code).toBe('at_floor');
  });

  it('ngưỡng 0,81 hạ chỉ tới sàn 0,80', () => {
    const r = suggestThreshold([...batch(15, 0.8, 0), ...batch(35, 0.95, 0)], 0.81);
    expect(r.suggestedThreshold).toBe(0.8);
  });

  it('nâng ưu tiên hơn hạ khi cả hai điều kiện cùng thỏa', () => {
    const r = suggestThreshold(
      [...batch(10, 0.9, 5), ...batch(15, 0.83, 0), ...batch(25, 0.6, 0)],
      T,
    );
    expect(r.action).toBe('raise');
  });
});

describe('US-041 canEnableAuto', () => {
  it('đủ mẫu nhưng tỷ lệ sửa chung > 10% → khóa', () => {
    const r = suggestThreshold(batch(50, 0.9, 6), T);
    expect(r.overallEditRate).toBe(0.12);
    expect(r.canEnableAuto).toBe(false);
  });

  it('đúng 10% sửa chung → mở', () => {
    expect(suggestThreshold(batch(50, 0.9, 5), T).canEnableAuto).toBe(true);
  });
});

describe('FR-072 suggestThreshold — đầu vào hỏng', () => {
  it('mẫu NaN/ngoài [0,1]/sai kiểu bị bỏ và đếm, không ném', () => {
    const bad = [
      { confidence: Number.NaN, edited: false },
      { confidence: 1.5, edited: false },
      { confidence: -0.1, edited: true },
      { confidence: 0.9, edited: 'yes' },
      null,
    ] as unknown as CalibrationSample[];
    const r = suggestThreshold([...bad, ...batch(50, 0.9, 0)], T);
    expect(r.ignoredCount).toBe(5);
    expect(r.sampleCount).toBe(50);
  });

  it('ngưỡng hiện tại hỏng/thấp hơn sàn → kẹp về [sàn, 0,99], NaN → mặc định 0,85', () => {
    expect(suggestThreshold(batch(50, 0.9, 0), 0.5).currentThreshold).toBe(0.8);
    expect(suggestThreshold(batch(50, 0.9, 0), Number.NaN).currentThreshold).toBe(0.85);
  });

  it('đầu vào không phải mảng → insufficient_data', () => {
    expect(suggestThreshold(undefined as unknown as CalibrationSample[], T).action).toBe(
      'insufficient_data',
    );
  });
});

describe('FR-072 trạng thái bản nháp → mẫu', () => {
  it('sent_as_is = đúng; edited/discarded = sai; trạng thái khác = chưa có nhãn', () => {
    expect(draftStatusToEdited('sent_as_is')).toBe(false);
    expect(draftStatusToEdited('edited')).toBe(true);
    expect(draftStatusToEdited('discarded')).toBe(true);
    for (const s of ['suggested', 'auto_sent', 'would_send', 'x']) {
      expect(draftStatusToEdited(s)).toBeNull();
    }
  });
});

describe('FR-120 calibrateByKey — riêng theo (kênh, nhãn, ngôn ngữ)', () => {
  const k = (lang: 'vi' | 'en') => ({ channelId: 'ch-1', label: 'price', lang });
  it('mỗi ngôn ngữ đếm mẫu riêng: vi đủ 50, en chỉ 10 → en không đề xuất', () => {
    const rows = [
      ...batch(50, 0.9, 0).map((s) => ({ ...k('vi'), ...s })),
      ...batch(10, 0.9, 0).map((s) => ({ ...k('en'), ...s })),
    ];
    const out = calibrateByKey(rows, () => T);
    expect(out.map((o) => [o.key, o.suggestion.action])).toEqual([
      [calibrationKey(k('en')), 'insufficient_data'],
      [calibrationKey(k('vi')), 'keep'],
    ]);
  });

  it('hàng hỏng (null, thiếu khóa) bị bỏ, không ném', () => {
    const bad = [null, { confidence: 0.9, edited: false }] as unknown as Parameters<
      typeof calibrateByKey
    >[0];
    expect(calibrateByKey(bad, () => T)).toEqual([]);
    expect(calibrateByKey(undefined as unknown as typeof bad, () => T)).toEqual([]);
  });

  it('dùng ngưỡng hiện tại của từng nhóm', () => {
    const rows = batch(50, 0.9, 0).map((s) => ({ ...k('vi'), ...s }));
    const out = calibrateByKey(rows, () => 0.9);
    expect(out[0]?.suggestion.currentThreshold).toBe(0.9);
  });
});

describe('FR-072 property-based', () => {
  const sample = fc.record({
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    edited: fc.boolean(),
  });
  const samples = fc.array(sample, { maxLength: 200 });
  const threshold = fc.double({ min: 0, max: 1.2, noNaN: true });

  it('đề xuất luôn trong [0,80; 0,99], không bao giờ ném', () => {
    fc.assert(
      fc.property(samples, threshold, (s, t) => {
        const r = suggestThreshold(s, t);
        expect(r.suggestedThreshold).toBeGreaterThanOrEqual(0.8);
        expect(r.suggestedThreshold).toBeLessThanOrEqual(0.99);
      }),
    );
  });

  it('< 50 mẫu ⇒ không đề xuất đổi và khóa Tự động', () => {
    fc.assert(
      fc.property(fc.array(sample, { maxLength: 49 }), threshold, (s, t) => {
        const r = suggestThreshold(s, t);
        expect(r.action).toBe('insufficient_data');
        expect(r.canEnableAuto).toBe(false);
        expect(r.suggestedThreshold).toBe(r.currentThreshold);
      }),
    );
  });

  it('raise ⇒ ngưỡng tăng và khoảng trên thật sự > 10% sửa với ≥ 10 mẫu; lower ⇒ ngưỡng giảm, 0% sửa, ≥ 15 mẫu', () => {
    fc.assert(
      fc.property(samples, threshold, (s, t) => {
        const r = suggestThreshold(s, t);
        if (r.action === 'raise') {
          expect(r.suggestedThreshold).toBeGreaterThan(r.currentThreshold);
          expect(r.upper.count).toBeGreaterThanOrEqual(10);
          expect(r.upper.editRate ?? 0).toBeGreaterThan(0.1);
        }
        if (r.action === 'lower') {
          expect(r.suggestedThreshold).toBeLessThan(r.currentThreshold);
          expect(r.suggestedThreshold).toBeGreaterThanOrEqual(0.8);
          expect(r.lower.count).toBeGreaterThanOrEqual(15);
          expect(r.lower.editRate).toBe(0);
        }
        if (r.action === 'keep' || r.action === 'insufficient_data') {
          expect(r.suggestedThreshold).toBe(r.currentThreshold);
        }
      }),
    );
  });

  it('kết quả không phụ thuộc thứ tự mẫu', () => {
    fc.assert(
      fc.property(samples, threshold, fc.integer(), (s, t, seed) => {
        const shuffled = [...s].sort(
          (a, b) => ((a.confidence * 7919 + seed) % 13) - ((b.confidence * 7919 + seed) % 13),
        );
        expect(suggestThreshold(shuffled, t)).toEqual(suggestThreshold(s, t));
      }),
    );
  });

  it('canEnableAuto ⇒ ≥ 50 mẫu và tỷ lệ sửa chung ≤ 10%', () => {
    fc.assert(
      fc.property(samples, threshold, (s, t) => {
        const r = suggestThreshold(s, t);
        if (r.canEnableAuto) {
          expect(r.sampleCount).toBeGreaterThanOrEqual(50);
          expect(r.overallEditRate ?? 1).toBeLessThanOrEqual(0.1);
        }
      }),
    );
  });
});
