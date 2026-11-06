import { z } from 'zod';
import { normalizeSearchText } from './search';

/**
 * Bảng size có cấu trúc (FR-149, docs/10 `size_charts`). Phần thuần: kiểm đầu vào của Owner và QUYẾT ĐỊNH tra size
 * (code chọn, AI chỉ soạn câu — AGENTS.md nguyên tắc 3/9). Không đoán: thiếu số đo → hỏi lại; nằm giữa hai size hoặc
 * ngoài bảng → mời ib; không có bảng → mời ib + ghi khoảng trống kiến thức.
 */
export const SIZE_LABEL_MAX = 20;
export const SIZE_CATEGORY_MAX = 100;
export const SIZE_NOTE_MAX = 200;
export const SIZE_MEASURES_MAX_KEYS = 10;
export const SIZE_MEASURE_KEY_MAX = 30;

/** Một dòng bảng size, đã rút còn các khoảng dùng để tra. `null` = không giới hạn phía đó. */
export type SizeChartRange = {
  size: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  note: string | null;
};

export type SizeMeasurements = { heightCm?: number | null; weightKg?: number | null };

export type SizeHandoffReason = 'between_sizes' | 'out_of_range' | 'no_chart';

export type SizeDecision =
  | { kind: 'size'; size: string; note: string | null }
  | { kind: 'ask'; missing: Array<'height' | 'weight'> }
  | { kind: 'handoff'; reason: SizeHandoffReason; sizes: string[]; recordGap: boolean };

const positive = z.number().finite().positive().max(1000);
const optionalBound = positive.nullish().transform((v) => v ?? null);
const trimmed = (max: number) =>
  z
    .string()
    .transform((v) => v.normalize('NFC').replace(/\s+/gu, ' ').trim())
    .pipe(z.string().min(1).max(max));

const sizeChartRowSchema = z
  .object({
    productId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
    category: trimmed(SIZE_CATEGORY_MAX)
      .nullish()
      .transform((v) => v ?? null),
    size: trimmed(SIZE_LABEL_MAX).transform((v) => v.toLocaleUpperCase('vi')),
    heightMinCm: optionalBound,
    heightMaxCm: optionalBound,
    weightMinKg: optionalBound,
    weightMaxKg: optionalBound,
    measures: z
      .record(trimmed(SIZE_MEASURE_KEY_MAX), z.union([z.string().max(50), z.number().finite()]))
      .default({})
      .refine((m) => Object.keys(m).length <= SIZE_MEASURES_MAX_KEYS, 'quá nhiều số đo'),
    note: trimmed(SIZE_NOTE_MAX)
      .nullish()
      .transform((v) => v ?? null),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .transform((v, ctx) => {
    const fail = (path: string, message: string) => {
      ctx.addIssue({ code: 'custom', path: [path], message });
      return z.NEVER;
    };
    const categoryNorm = v.category === null ? null : normalizeSearchText(v.category);
    if (categoryNorm === '') return fail('category', 'danh mục phải có chữ hoặc số');
    if ((v.productId === null) === (categoryNorm === null)) {
      return fail('productId', 'phải có đúng một trong sản phẩm hoặc danh mục');
    }
    const ranges = [v.heightMinCm, v.heightMaxCm, v.weightMinKg, v.weightMaxKg];
    if (ranges.every((r) => r === null)) return fail('heightMinCm', 'cần ít nhất một cận số đo');
    if (v.heightMinCm !== null && v.heightMaxCm !== null && v.heightMinCm > v.heightMaxCm) {
      return fail('heightMinCm', 'chiều cao tối thiểu lớn hơn tối đa');
    }
    if (v.weightMinKg !== null && v.weightMaxKg !== null && v.weightMinKg > v.weightMaxKg) {
      return fail('weightMinKg', 'cân nặng tối thiểu lớn hơn tối đa');
    }
    return { ...v, categoryNorm };
  });

export type SizeChartRowInput = z.output<typeof sizeChartRowSchema>;

export function parseSizeChartRow(input: unknown) {
  return sizeChartRowSchema.safeParse(input);
}

type Dimension = 'height' | 'weight';

function bounds(row: SizeChartRange, d: Dimension): [number | null, number | null] {
  return d === 'height' ? [row.heightMinCm, row.heightMaxCm] : [row.weightMinKg, row.weightMaxKg];
}

const isUsable = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

function within(value: number, [min, max]: [number | null, number | null]): boolean {
  return (min === null || value >= min) && (max === null || value <= max);
}

/** Chiều nào bảng có ràng buộc (ít nhất một dòng có cận) — chỉ chiều đó mới đòi khách cung cấp. */
function neededDimensions(rows: SizeChartRange[]): Dimension[] {
  return (['height', 'weight'] as const).filter((d) =>
    rows.some((r) => bounds(r, d).some((b) => b !== null)),
  );
}

/** Giá trị nằm trong khoảng bao toàn bảng (từ cận nhỏ nhất đến lớn nhất) — dùng phân biệt "giữa hai size" và "ngoài bảng". */
function withinOverallSpan(rows: SizeChartRange[], d: Dimension, value: number): boolean {
  const all = rows.map((r) => bounds(r, d));
  const lows = all.map(([min, max]) => min ?? max).filter((v): v is number => v !== null);
  const highs = all.map(([min, max]) => max ?? min).filter((v): v is number => v !== null);
  const openLow = all.some(([min, max]) => min === null && max !== null);
  const openHigh = all.some(([min, max]) => max === null && min !== null);
  const low = openLow ? Number.NEGATIVE_INFINITY : Math.min(...lows);
  const high = openHigh ? Number.POSITIVE_INFINITY : Math.max(...highs);
  return value >= low && value <= high;
}

/**
 * Tra size từ các dòng bảng đã chọn (theo sản phẩm, nếu không có thì theo danh mục — việc của truy vấn DB).
 * Khớp khi MỌI chiều bảng có ràng buộc đều nằm trong khoảng (biên đóng hai đầu).
 */
export function decideSize(rows: SizeChartRange[], m: SizeMeasurements): SizeDecision {
  if (rows.length === 0) return { kind: 'handoff', reason: 'no_chart', sizes: [], recordGap: true };

  const needed = neededDimensions(rows);
  const value: Record<Dimension, number | null> = {
    height: isUsable(m.heightCm) ? m.heightCm : null,
    weight: isUsable(m.weightKg) ? m.weightKg : null,
  };
  const missing = needed.filter((d) => value[d] === null);
  if (missing.length > 0) return { kind: 'ask', missing };

  const matches = rows.filter((r) => needed.every((d) => within(value[d] as number, bounds(r, d))));
  const sizes = [...new Set(matches.map((r) => r.size))];
  const [only] = matches;
  if (sizes.length === 1 && only) return { kind: 'size', size: only.size, note: only.note };
  if (sizes.length > 1) {
    return { kind: 'handoff', reason: 'between_sizes', sizes, recordGap: false };
  }
  const inSpan = needed.every((d) => withinOverallSpan(rows, d, value[d] as number));
  return {
    kind: 'handoff',
    reason: inSpan ? 'between_sizes' : 'out_of_range',
    sizes: [],
    recordGap: false,
  };
}
