#!/usr/bin/env node
// Cổng kế hoạch bằng công cụ (không dùng AI). Dùng: pnpm check:plans [--branch tên-nhánh] [--base origin/main]
//  1) mọi file docs/plans/*.md: plan ĐÃ DUYỆT không còn thẻ [CẦN LÀM RÕ], ô chưa tick, tiêu chí rỗng (lib/plan-gate.mjs);
//  2) nhánh feat/* và chore/* phải có plan của mình (đang tồn tại hoặc từng được thêm trong lịch sử nhánh);
//     mech/*, ops/* và fix/* được miễn.
// Chạy ở bước 1 của docs/workflows/finish.md và trong CI. Chỉ in vấn đề; thoát 1 nếu có.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkBranchPlan, checkPlan, planRequirement } from './lib/plan-gate.mjs';
import { currentBranch, plansAddedSince } from './lib/plan-history.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const dir = new URL('../docs/plans/', import.meta.url);
const SKIP = new Set(['README.md', 'TEMPLATE.md']);
const plans = readdirSync(dir).filter((name) => name.endsWith('.md') && !SKIP.has(name));

const problems = [];
for (const name of plans) {
  for (const problem of checkPlan(readFileSync(new URL(name, dir), 'utf8'))) {
    problems.push(`docs/plans/${name}: ${problem}`);
  }
}

const branch = option('--branch') ?? currentBranch();
const requirement = branch ? planRequirement(branch) : 'exempt';
if (requirement === 'required') {
  const base = option('--base') ?? 'origin/main';
  const addedPlans = plansAddedSince(base);
  if (addedPlans === null) {
    console.log(
      `check:plans: không đọc được lịch sử ${base}..HEAD — bỏ qua kiểm "nhánh có plan" (chỉ kiểm file hiện có)`,
    );
  }
  for (const problem of checkBranchPlan({ branch, existingPlans: plans, addedPlans })) {
    problems.push(problem);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\ncheck:plans: ${problems.length} vấn đề (${fileURLToPath(dir)})`);
  process.exit(1);
}
const scope =
  requirement === 'required'
    ? `nhánh ${branch} cần plan`
    : `nhánh ${branch || '(không rõ)'} được miễn plan`;
console.log(`check:plans: đạt (${plans.length} kế hoạch; ${scope})`);
