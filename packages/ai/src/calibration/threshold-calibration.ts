import { DEFAULT_THRESHOLD, THRESHOLD_FLOOR } from '../gate/auto-send-gate';

/**
 * Hiệu chuẩn NGƯỠNG tự gửi (FR-072, US-041, `docs/09` §6 đoạn "Hiệu chuẩn ngưỡng", `docs/03` M08, Q-AC1).
 *
 * Hàm THUẦN: nhận các mẫu đã đọc ở DB (độ tin cậy lúc soạn + nhân viên có sửa/bỏ hay không) và trả ĐỀ XUẤT kèm
 * lý do dạng mã + số liệu (giao diện dịch vi/en). Không ghi gì, không tự áp dụng: Owner xác nhận mới đổi ngưỡng.
 *
 * Quy tắc (số do spec chốt: 50 / 10% / 15 / 0,80):
 * - < 50 mẫu hợp lệ → không đề xuất, `canEnableAuto = false`.
 * - Khoảng trên (`confidence ≥ ngưỡng`) có ≥ 10 mẫu và > 10% bị sửa → NÂNG.
 * - Khoảng dưới ([ngưỡng − 0,05, ngưỡng)) có ≥ 15 mẫu và 0% sửa → HẠ, không bao giờ dưới sàn 0,80.
 * - Nâng ưu tiên hơn hạ. `canEnableAuto` = ≥ 50 mẫu và tỷ lệ sửa chung ≤ 10% (US-041).
 * Tính riêng theo (kênh, nhãn, ngôn ngữ) qua `calibrateByKey` (FR-120). Nơi gọi đọc mẫu trong `withWorkspace`.
 */

export const CALIBRATION_MIN_SAMPLES = 50;
export const CALIBRATION_MAX_EDIT_RATE = 0.1;
export const CALIBRATION_RAISE_MIN_BAND_SAMPLES = 10;
export const CALIBRATION_LOWER_BAND_SAMPLES = 15;
export const CALIBRATION_LOWER_BAND_WIDTH = 0.05;
export const CALIBRATION_STEP = 0.02;
export const CALIBRATION_THRESHOLD_CEILING = 0.99;

const EPS = 1e-9;

export type CalibrationSample = {
  /** Độ tin cậy do code tính lúc soạn, trong [0,1]. */
  confidence: number;
  /** Nhân viên sửa hoặc bỏ bản nháp (= sai); `false` = gửi nguyên văn (= đúng). */
  edited: boolean;
};

/** `drafts.status` → nhãn đúng/sai; trạng thái chưa có kết quả người xử lý → `null` (không dùng làm mẫu). */
export function draftStatusToEdited(status: string): boolean | null {
  if (status === 'sent_as_is') return false;
  if (status === 'edited' || status === 'discarded') return true;
  return null;
}

export type BandStats = { count: number; editRate: number | null };

export type SuggestionAction = 'raise' | 'lower' | 'keep' | 'insufficient_data';
export type SuggestionReasonCode =
  | 'insufficient_samples'
  | 'raise_upper_band_edited'
  | 'lower_band_clean'
  | 'at_floor'
  | 'at_ceiling'
  | 'keep_stable';

export type ThresholdSuggestion = {
  action: SuggestionAction;
  currentThreshold: number;
  /** Bằng `currentThreshold` khi không đề xuất đổi. */
  suggestedThreshold: number;
  sampleCount: number;
  ignoredCount: number;
  overallEditRate: number | null;
  upper: BandStats;
  lower: BandStats;
  /** Nút "Chuyển sang Tự động" chỉ sáng khi true. */
  canEnableAuto: boolean;
  reason: { code: SuggestionReasonCode; params: Record<string, number> };
};

const round2 = (x: number) => Math.round(x * 100) / 100;

function normalizeThreshold(raw: number): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return DEFAULT_THRESHOLD;
  return Math.min(CALIBRATION_THRESHOLD_CEILING, Math.max(THRESHOLD_FLOOR, round2(raw)));
}

function isValidSample(s: unknown): s is CalibrationSample {
  if (typeof s !== 'object' || s === null) return false;
  const { confidence, edited } = s as Record<string, unknown>;
  return (
    typeof confidence === 'number' &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1 &&
    typeof edited === 'boolean'
  );
}

function bandStats(samples: readonly CalibrationSample[]): BandStats {
  const edited = samples.filter((s) => s.edited).length;
  return { count: samples.length, editRate: samples.length === 0 ? null : edited / samples.length };
}

export function suggestThreshold(
  rawSamples: readonly CalibrationSample[],
  currentThreshold: number,
): ThresholdSuggestion {
  const input: readonly unknown[] = Array.isArray(rawSamples) ? rawSamples : [];
  const samples = input.filter(isValidSample);
  const current = normalizeThreshold(currentThreshold);

  const upperSamples = samples.filter((s) => s.confidence >= current - EPS);
  const lowerEdge = current - CALIBRATION_LOWER_BAND_WIDTH;
  const lowerSamples = samples.filter(
    (s) => s.confidence < current - EPS && s.confidence >= lowerEdge - EPS,
  );
  const upper = bandStats(upperSamples);
  const lower = bandStats(lowerSamples);
  const overall = bandStats(samples);

  const enoughSamples = samples.length >= CALIBRATION_MIN_SAMPLES;
  const base = {
    currentThreshold: current,
    sampleCount: samples.length,
    ignoredCount: input.length - samples.length,
    overallEditRate: overall.editRate,
    upper,
    lower,
    canEnableAuto: enoughSamples && (overall.editRate ?? 1) <= CALIBRATION_MAX_EDIT_RATE + EPS,
  };
  const result = (
    action: SuggestionAction,
    suggestedThreshold: number,
    code: SuggestionReasonCode,
    params: Record<string, number>,
  ): ThresholdSuggestion => ({
    ...base,
    action,
    suggestedThreshold,
    reason: { code, params },
  });

  if (!enoughSamples) {
    return result('insufficient_data', current, 'insufficient_samples', {
      sampleCount: samples.length,
      required: CALIBRATION_MIN_SAMPLES,
    });
  }

  const shouldRaise =
    upper.count >= CALIBRATION_RAISE_MIN_BAND_SAMPLES &&
    (upper.editRate ?? 0) > CALIBRATION_MAX_EDIT_RATE + EPS;
  if (shouldRaise) {
    if (current >= CALIBRATION_THRESHOLD_CEILING) {
      return result('keep', current, 'at_ceiling', { ceiling: CALIBRATION_THRESHOLD_CEILING });
    }
    return result(
      'raise',
      Math.min(CALIBRATION_THRESHOLD_CEILING, round2(current + CALIBRATION_STEP)),
      'raise_upper_band_edited',
      {
        bandCount: upper.count,
        editRate: upper.editRate ?? 0,
        maxEditRate: CALIBRATION_MAX_EDIT_RATE,
      },
    );
  }

  const shouldLower = lower.count >= CALIBRATION_LOWER_BAND_SAMPLES && lower.editRate === 0;
  if (shouldLower) {
    if (current <= THRESHOLD_FLOOR + EPS) {
      return result('keep', current, 'at_floor', { floor: THRESHOLD_FLOOR });
    }
    return result(
      'lower',
      Math.max(THRESHOLD_FLOOR, round2(current - CALIBRATION_STEP)),
      'lower_band_clean',
      { bandCount: lower.count, editRate: 0 },
    );
  }

  return result('keep', current, 'keep_stable', {
    upperCount: upper.count,
    lowerCount: lower.count,
  });
}

// ---------- Theo (kênh, nhãn, ngôn ngữ) — FR-120 ----------

export type CalibrationKeyParts = { channelId: string; label: string; lang: string };
export type KeyedCalibrationSample = CalibrationKeyParts & CalibrationSample;

export function calibrationKey(p: CalibrationKeyParts): string {
  return JSON.stringify([p.channelId, p.label, p.lang]);
}

/** Mỗi (kênh, nhãn, ngôn ngữ) đếm mẫu riêng; kết quả xếp theo khóa để ổn định. */
export function calibrateByKey(
  rows: readonly KeyedCalibrationSample[],
  thresholdFor: (key: CalibrationKeyParts) => number,
): Array<{ key: string; suggestion: ThresholdSuggestion }> {
  const groups = new Map<string, { parts: CalibrationKeyParts; samples: CalibrationSample[] }>();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row !== 'object' || row === null) continue;
    const { channelId, label, lang } = row;
    if (typeof channelId !== 'string' || typeof label !== 'string' || typeof lang !== 'string') {
      continue;
    }
    const parts = { channelId, label, lang };
    const key = calibrationKey(parts);
    const group = groups.get(key) ?? { parts, samples: [] };
    group.samples.push({ confidence: row.confidence, edited: row.edited });
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, g]) => ({ key, suggestion: suggestThreshold(g.samples, thresholdFor(g.parts)) }));
}
