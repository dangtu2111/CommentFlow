// pnpm dev:seed-demo [--reset] — dữ liệu mẫu [MẪU] CHỈ cho DB dev `cf_dev` (Q-UIF1). Mật khẩu in một lần, không lưu file.
import { createDb } from '@flow/db/runtime';
import { hashPassword } from '@flow/saas-core';
import { isAppError, parseEnv } from '@flow/shared';
import pg from 'pg';
import { z } from 'zod';
import { assertDevSeedAllowed } from './guard';
import { seedDemo } from './seed';

const optional = z.string().optional();
const envSchema = z.object({
  APP_ENV: optional,
  DATABASE_ADMIN_URL: optional,
  DATABASE_URL: optional,
  DATABASE_WORKER_URL: optional,
});

const ARGS = new Set(process.argv.slice(2));
const unknown = [...ARGS].filter((a) => a !== '--reset');
if (unknown.length > 0) {
  console.error(`Tham số lạ: ${unknown.join(' ')} (chỉ có --reset).`);
  process.exit(2);
}

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
      { reset: ARGS.has('--reset') },
    );
    if (result.status === 'exists') {
      console.log('Workspace mẫu đã có — không làm gì. Chạy lại với --reset để tạo lại.');
    } else {
      console.log(`Đã tạo workspace "[MẪU] Demo Shop" (${result.workspaceId}).`);
      console.log(JSON.stringify(result.counts));
      console.log('Tài khoản thử (mật khẩu chỉ hiện MỘT LẦN, không lưu ở đâu):');
      for (const c of result.credentials)
        console.log(`  ${c.role.padEnd(5)} ${c.email}  ${c.password}`);
    }
  } finally {
    await Promise.all([admin.end(), appDb.close(), workerDb.close()]);
  }
} catch (error) {
  // Không in nguyên đối tượng lỗi (lỗi pg có thể kèm host/chi tiết dòng dữ liệu).
  console.error(
    isAppError(error)
      ? `[${error.code}] ${error.message}`
      : `Lỗi: ${error instanceof Error ? error.message : 'không rõ'}`,
  );
  process.exit(1);
}
