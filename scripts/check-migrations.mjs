#!/usr/bin/env node
// Cổng số migration bằng công cụ: pnpm check:migrations. Chạy ở CI và bước kết thúc việc.
import { readdirSync, readFileSync } from 'node:fs';
import { checkMigrations } from './lib/migrations-check.mjs';

const dir = new URL('../packages/db/migrations/', import.meta.url);
const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', dir), 'utf8'));
const problems = checkMigrations({ journal, sqlFiles: readdirSync(dir) });

if (problems.length > 0) {
  console.error('check:migrations — phát hiện vấn đề:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`check:migrations — ${journal.entries.length} migration, số thứ tự liên tục.`);
