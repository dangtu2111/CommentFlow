// `pnpm precheck`: agent chạy trước mỗi lần push (không hook, không tự chạy).
import { spawnSync } from 'node:child_process';
import { PRECHECK_STEPS, runSteps } from './lib/precheck.mjs';

const result = runSteps(PRECHECK_STEPS, (step) => {
  console.log(`\n▶ pnpm ${step.script}`);
  return spawnSync(`pnpm ${step.script}`, { stdio: 'inherit', shell: true }).status ?? 1;
});

if (!result.ok) {
  console.error(`\n✖ precheck dừng ở bước: pnpm ${result.failed}`);
  process.exit(1);
}
console.log('\n✔ precheck xanh — có thể push');
