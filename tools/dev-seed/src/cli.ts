// pnpm dev:seed-demo [--reset | --refresh] [--into <email-owner>] — dữ liệu mẫu [MẪU] CHỈ cho DB dev `cf_dev` (Q-UIF1).
// Mật khẩu (chỉ của tài khoản MỚI tạo) in một lần, không lưu file.
import { createDb } from '@flow/db/runtime';
import { hashPassword } from '@flow/saas-core';
import { parseEnv } from '@flow/shared';
import pg from 'pg';
import { z } from 'zod';
import { describeSeedError } from './describe-error';
import { assertDevSeedAllowed } from './guard';
import { parseSeedArgs } from './parse-args';
import { seedDemo } from './seed';

const optional = z.string().optional();
const envSchema = z.object({
  APP_ENV: optional,
  DATABASE_ADMIN_URL: optional,
  DATABASE_URL: optional,
  DATABASE_WORKER_URL: optional,
});

const parsed = parseSeedArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}
const { options } = parsed;

try {
  const env = parseEnv(envSchema, process.env);
  // Cổng chặn TRƯỚC khi mở bất kỳ kết nối nào.
  const database = assertDevSeedAllowed({
    appEnv: env.APP_ENV,
    adminUrl: env.DATABASE_ADMIN_URL,
    appUrl: env.DATABASE_URL,
    workerUrl: env.DATABASE_WORKER_URL,
  });
  console.warn(
    `⚠  DỮ LIỆU MẪU: sẽ ghi dữ liệu "[MẪU]" vào database ${database} (dev). Không phải số liệu thật.`,
  );
  const admin = new pg.Pool({ connectionString: env.DATABASE_ADMIN_URL as string, max: 2 });
  const appDb = createDb({ connectionString: env.DATABASE_URL as string, max: 2 });
  const workerDb = createDb({ connectionString: env.DATABASE_WORKER_URL as string, max: 2 });
  try {
    const result = await seedDemo(
      { admin, appDb, workerDb, hashPassword, now: new Date() },
      options,
    );
    if (result.status === 'exists') {
      console.log(
        'Dữ liệu mẫu đã có — không làm gì. Dùng --refresh để làm mới (giữ tài khoản) hoặc --reset để tạo lại (đổi mật khẩu).',
      );
    } else {
      const verb = { created: 'Đã tạo', refreshed: 'Đã làm mới', loaded: 'Đã nạp' }[result.status];
      console.log(`${verb} dữ liệu mẫu cho workspace ${result.workspaceId}.`);
      console.log(JSON.stringify(result.counts));
      if (result.credentials.length > 0) {
        console.log('Tài khoản thử MỚI tạo (mật khẩu chỉ hiện MỘT LẦN, không lưu ở đâu):');
        for (const c of result.credentials)
          console.log(`  ${c.role.padEnd(6)} ${c.email}  ${c.password}`);
      } else {
        console.log('Không tạo tài khoản mới — mật khẩu/2FA của tài khoản đang có giữ nguyên.');
      }
    }
  } finally {
    await Promise.all([admin.end(), appDb.close(), workerDb.close()]);
  }
} catch (error) {
  console.error(describeSeedError(error));
  process.exit(1);
}
