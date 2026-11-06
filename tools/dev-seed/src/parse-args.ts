import type { SeedOptions } from './seed';

export type ParsedSeedArgs = { ok: true; options: SeedOptions } | { ok: false; error: string };

const USAGE = 'Cách dùng: dev:seed-demo [--reset | --refresh] [--into <email-owner>]';

/** `--reset` (tạo lại, đổi tài khoản) loại trừ `--refresh`/`--into` (giữ tài khoản). */
export function parseSeedArgs(argv: readonly string[]): ParsedSeedArgs {
  const options: SeedOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reset') options.reset = true;
    else if (arg === '--refresh') options.refresh = true;
    else if (arg === '--into') {
      const email = argv[i + 1];
      if (!email || email.startsWith('--') || !email.includes('@')) {
        return { ok: false, error: `--into cần email Owner. ${USAGE}` };
      }
      options.into = email;
      i += 1;
    } else return { ok: false, error: `Tham số lạ: ${arg}. ${USAGE}` };
  }
  if (options.reset && (options.refresh || options.into)) {
    return { ok: false, error: `--reset không dùng cùng --refresh/--into. ${USAGE}` };
  }
  return { ok: true, options };
}
