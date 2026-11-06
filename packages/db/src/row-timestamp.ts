import { AppError } from '@flow/shared';
import pg from 'pg';

/**
 * Drizzle trên node-postgres trả cột `timestamp`/`timestamptz`/`date` của `tx.execute(sql\`…\`)` dưới dạng CHUỖI thô
 * của Postgres (ví dụ `2026-11-06 05:43:03.943757+00`), KHÔNG phải `Date` như `pg` thuần — chỉ truy vấn qua schema
 * Drizzle mới được ánh xạ. Chuỗi đó không phải ISO 8601 nên Zod `z.iso.datetime` từ chối, và `.getTime()` sẽ nổ.
 * Mọi nơi đọc mốc thời gian từ dòng `execute` phải đi qua `timestampFromRow` trước khi so sánh hoặc kiểm bằng Zod.
 */
export type RawTimestamp = Date | string | null;

type TimestampParser = (value: string) => Date | null;
const parseTimestamptz = pg.types.getTypeParser(pg.types.builtins.TIMESTAMPTZ) as TimestampParser;

const isValidDate = (d: unknown): d is Date => d instanceof Date && Number.isFinite(d.getTime());

/**
 * `null` giữ `null`; `Date` giữ nguyên; chuỗi Postgres → `Date` bằng bộ phân tích của `pg` (ISO 8601 có `T` cũng
 * đọc được, phòng dòng đã qua JSON); chuỗi hỏng → ném (không nuốt, không "mở" vì dữ liệu hỏng).
 */
export function timestampFromRow(value: RawTimestamp | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const fromPg = parseTimestamptz(value);
  if (isValidDate(fromPg)) return fromPg;
  const fromIso = value.trim() === '' ? null : new Date(value);
  if (isValidDate(fromIso)) return fromIso;
  throw new AppError('VALIDATION_FAILED', 'Mốc thời gian đọc từ DB không hợp lệ.');
}
