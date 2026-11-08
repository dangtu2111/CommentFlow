// `pnpm push:safe [tham số git push]` — xem lib/push-safe.mjs. Output của precheck/git đi thẳng ra terminal (stdio kế thừa), không qua ống.
import { spawnSync } from 'node:child_process';
import { runPushSafe, upstreamMatches } from './lib/push-safe.mjs';

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}').stdout.trim();
const hasUpstream = upstreamMatches(branch, upstream);

const { exitCode } = runPushSafe({
  argv: process.argv.slice(2),
  hasUpstream,
  precheck: () => spawnSync('pnpm precheck', { stdio: 'inherit', shell: true }).status,
  push: (args) => spawnSync('git', ['push', ...args], { stdio: 'inherit' }).status,
  log: (line) => console.error(line),
});
process.exit(exitCode);
