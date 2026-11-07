// pnpm dev:push-webhook [--workspace "Shop Thử 2"] [--text "…"] [--cleanup] — CHỈ cf_dev. Đẩy 1 webhook bình luận FIXTURE qua đường thật.
import { createDb } from '@flow/db/runtime';
import { parseEnv } from '@flow/shared';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { describeSeedError } from './describe-error';
import { assertDevSeedAllowed } from './guard';
import { cleanupFixture, parsePushArgs, pushFixtureWebhook } from './push-webhook';

const optional = z.string().optional();
const envSchema = z.object({
  APP_ENV: optional,
  DATABASE_ADMIN_URL: optional,
  DATABASE_URL: optional,
  DATABASE_WORKER_URL: optional,
});

const parsed = parsePushArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}
const { args } = parsed;

try {
  const env = parseEnv(envSchema, process.env);
  const database = assertDevSeedAllowed({
    appEnv: env.APP_ENV,
    adminUrl: env.DATABASE_ADMIN_URL,
    appUrl: env.DATABASE_URL,
    workerUrl: env.DATABASE_WORKER_URL,
  });
  console.warn(
    `⚠  FIXTURE: ghi dữ liệu "[FIXTURE]" vào ${database} (dev). Không phải dữ liệu khách thật.`,
  );
  const admin = new pg.Pool({ connectionString: env.DATABASE_ADMIN_URL as string, max: 2 });
  try {
    if (args.cleanup) {
      const done = await cleanupFixture(admin, args.workspace);
      console.log(
        `Đã dọn fixture của workspace ${done.workspaceId}: ${done.comments} bình luận, ${done.drafts} bản nháp.`,
      );
    } else {
      const appDb = createDb({ connectionString: env.DATABASE_URL as string, max: 2 });
      // Chỉ gửi job (như web): không migrate/giám sát.
      const boss = new PgBoss({
        connectionString: env.DATABASE_URL as string,
        schema: 'pgboss',
        migrate: false,
        createSchema: false,
        supervise: false,
        schedule: false,
        application_name: 'cf-dev-push-webhook',
        max: 1,
      });
      boss.on('error', (error: Error) => console.warn(`pg-boss: ${error.name}`));
      await boss.start();
      try {
        const result = await pushFixtureWebhook(
          { admin, appDb, enqueue: async (job) => void (await boss.send('ingest', job)) },
          args,
        );
        console.log(
          `Đã đẩy webhook fixture vào "${result.workspaceName}" (${result.workspaceId}).`,
        );
        console.log(`  sự kiện: ${result.eventId}  bình luận: ${result.commentExternalId}`);
        console.log(
          'Worker (ingest → pipeline) sẽ xử lý; xem bản nháp ở chi tiết bình luận. Dọn: pnpm dev:push-webhook --cleanup',
        );
      } finally {
        await boss.stop({ graceful: false });
        await appDb.close();
      }
    }
  } finally {
    await admin.end();
  }
} catch (error) {
  console.error(describeSeedError(error));
  process.exit(1);
}
