// `pnpm push:safe [tham số git push]` — xem lib/push-safe.mjs. Output của precheck/git đi thẳng ra terminal (stdio kế thừa), không qua ống.
import { spawnSync } from 'node:child_process';
import { runPushSafe } from './lib/push-safe.mjs';

const hasUpstream =
  spawnSync('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], {
    stdio: 'ignore',
  }).status === 0;

const { exitCode } = runPushSafe({
  argv: process.argv.slice(2),
  hasUpstream,
  precheck: () => spawnSync('pnpm precheck', { stdio: 'inherit', shell: true }).status,
  push: (args) => spawnSync('git', ['push', ...args], { stdio: 'inherit' }).status,
  log: (line) => console.error(line),
});
process.exit(exitCode);
