// Sửa DB DEV lệch với file migration (xem docs/workflows/db-drift.md): phát lại có kiểm soát các migration được nêu tên.
//   pnpm --filter @flow/db db:repair-dev 0055_workspace_deletion 0058_msg_store
// CHỈ APP_ENV=dev và database cf_dev. Mỗi câu chạy trong savepoint: câu "đã tồn tại" bỏ qua, hàm/policy/trigger được thay bằng
// bản hiện tại, câu sửa dữ liệu (UPDATE/DELETE/INSERT/TRUNCATE) bỏ qua. Ghi sổ mã băm để cảnh báo lệch biến mất.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashMigrationSql } from '../migration-drift';

const MIGRATIONS = fileURLToPath(new URL('../../migrations', import.meta.url));
const SKIP_CODES = new Set(['42P07', '42710', '42701', '42723', '42P06', '42P16', '42P01']);

/** Viết lại một câu để chạy lại được: hàm → OR REPLACE; policy/trigger → DROP IF EXISTS rồi tạo lại. */
export function makeReplayable(statement: string): string {
  const replaced = statement.replace(/CREATE FUNCTION /g, 'CREATE OR REPLACE FUNCTION ');
  const drops: string[] = [];
  for (const m of replaced.matchAll(/CREATE POLICY\s+("?\w+"?)\s+ON\s+([\w."]+)/g)) {
    drops.push(`DROP POLICY IF EXISTS ${m[1]} ON ${m[2]};`);
  }
  for (const m of replaced.matchAll(/CREATE TRIGGER\s+("?\w+"?)[\s\S]*?\sON\s+([\w."]+)/g)) {
    drops.push(`DROP TRIGGER IF EXISTS ${m[1]} ON ${m[2]};`);
  }
  return drops.length > 0 ? `${drops.join('\n')}\n${replaced}` : replaced;
}

export const isDataStatement = (statement: string): boolean =>
  /^\s*(--[^\n]*\n\s*)*(UPDATE|DELETE|INSERT|TRUNCATE)\b/i.test(statement);

async function main(tags: string[]): Promise<void> {
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? '';
  if (process.env.APP_ENV !== 'dev') throw new Error('Chỉ chạy khi APP_ENV=dev.');
  if (new URL(adminUrl).pathname !== '/cf_dev') throw new Error('Chỉ chạy trên database cf_dev.');
  if (tags.length === 0) throw new Error('Nêu tên migration, ví dụ: 0055_workspace_deletion.');
  const journal = (
    JSON.parse(readFileSync(`${MIGRATIONS}/meta/_journal.json`, 'utf8')) as {
      entries: Array<{ tag: string; when: number }>;
    }
  ).entries;
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  const client = await pool.connect();
  try {
    for (const tag of tags) {
      const entry = journal.find((e) => e.tag === tag);
      if (!entry) throw new Error(`Không có migration ${tag} trong journal.`);
      const text = readFileSync(`${MIGRATIONS}/${tag}.sql`, 'utf8');
      await client.query('BEGIN');
      let ran = 0;
      let skipped = 0;
      for (const raw of text.split('--> statement-breakpoint')) {
        const statement = raw.trim();
        if (!statement || /^(--[^\n]*\n?)+$/.test(statement)) continue;
        if (isDataStatement(statement)) continue;
        await client.query('SAVEPOINT s');
        try {
          await client.query(makeReplayable(statement));
          await client.query('RELEASE SAVEPOINT s');
          ran += 1;
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT s');
          const code = (error as { code?: string }).code ?? '';
          if (!SKIP_CODES.has(code)) throw error;
          skipped += 1;
        }
      }
      await client.query(
        'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [hashMigrationSql(text), entry.when],
      );
      await client.query('COMMIT');
      console.log(`${tag}: chạy ${ran} câu, bỏ qua ${skipped} câu đã tồn tại, đã ghi sổ.`);
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href
) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
