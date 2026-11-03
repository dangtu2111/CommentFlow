#!/usr/bin/env node
// Kiểm mọi kế hoạch trong docs/plans/*.md bằng cổng ở lib/plan-gate.mjs. Dùng: pnpm check:plans
// Chạy ở bước 1 của docs/workflows/finish.md và trong CI. Chỉ in vấn đề; thoát 1 nếu có.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkPlan } from './lib/plan-gate.mjs';

const dir = new URL('../docs/plans/', import.meta.url);
const SKIP = new Set(['README.md', 'TEMPLATE.md']);

let failed = 0;
const plans = readdirSync(dir).filter((name) => name.endsWith('.md') && !SKIP.has(name));
for (const name of plans) {
  const problems = checkPlan(readFileSync(new URL(name, dir), 'utf8'));
  for (const problem of problems) {
    failed += 1;
    console.error(`docs/plans/${name}: ${problem}`);
  }
}
if (failed > 0) {
  console.error(`\ncheck:plans: ${failed} vấn đề ở ${fileURLToPath(dir)}`);
  process.exit(1);
}
console.log(`check:plans: đạt (${plans.length} kế hoạch)`);
