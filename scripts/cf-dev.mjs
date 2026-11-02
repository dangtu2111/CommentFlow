#!/usr/bin/env node
// Điều khiển project cf-dev trên máy ảo qua `ssh cf`. Ví dụ:
//   pnpm cf:dev sync chore/scaffold     (git fetch + checkout + pull --ff-only trên máy ảo)
//   pnpm cf:dev env-init                (sinh .env.cf-dev ngay trên máy ảo, không in bí mật)
//   pnpm cf:dev up -d --build
//   pnpm cf:dev ps | logs --tail=50 litellm | stats | down
import { spawnSync } from 'node:child_process';
import { buildRemoteCommand, CfDevCommandError } from './lib/cf-dev-command.mjs';

try {
  const remote = buildRemoteCommand(process.argv.slice(2));
  const result = spawnSync('ssh', ['cf', remote], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
} catch (error) {
  if (error instanceof CfDevCommandError) {
    console.error(`cf-dev: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
