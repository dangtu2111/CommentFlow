import type { SeedOptions } from './seed';

export type ParsedSeedArgs = { ok: true; options: SeedOptions } | { ok: false; error: string };

const USAGE = 'Cách dùng: dev:seed-demo [--reset | --refresh]';

/**
 * `--reset` (tạo lại, đổi tài khoản) loại trừ `--refresh` (giữ tài khoản). `--into` đã BỎ: seed CHỈ ghi vào workspace [MẪU] (Q-SDO1),
 * không bao giờ ghi vào workspace của người dùng thật.
 */
export function parseSeedArgs(argv: readonly string[]): ParsedSeedArgs {
  const options: SeedOptions = {};
  for (const arg of argv) {
    if (arg === '--reset') options.reset = true;
    else if (arg === '--refresh') options.refresh = true;
    else if (arg === '--into') {
      return {
        ok: false,
        error: `--into đã bỏ: dev:seed-demo chỉ ghi vào workspace [MẪU], không ghi vào workspace khác. ${USAGE}`,
      };
    } else return { ok: false, error: `Tham số lạ: ${arg}. ${USAGE}` };
  }
  if (options.reset && options.refresh) {
    return { ok: false, error: `--reset không dùng cùng --refresh. ${USAGE}` };
  }
  return { ok: true, options };
}
