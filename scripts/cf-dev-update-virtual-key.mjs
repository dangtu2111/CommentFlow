#!/usr/bin/env node
// Cập nhật khóa ảo LiteLLM dev: cho phép cf-classify, cf-draft, mock-llm; max_budget 10 USD / 30 ngày.
//   pnpm cf:dev:update-vkey [--models a,b,c] [--max-budget 10] [--duration 30d]
// Đọc LITELLM_API_KEY từ môi trường (.env.local), tính MÃ BĂM SHA-256 rồi chạy script Python trong container litellm qua `ssh cf`.
// Khóa thật và master key KHÔNG bao giờ được in hay truyền qua dòng lệnh.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  buildRemoteCommand,
  DEFAULT_DURATION,
  DEFAULT_MAX_BUDGET,
  DEFAULT_MODELS,
  hashVirtualKey,
  VirtualKeyError,
} from './lib/virtual-key-update.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    models: { type: 'string', default: DEFAULT_MODELS.join(',') },
    'max-budget': { type: 'string', default: String(DEFAULT_MAX_BUDGET) },
    duration: { type: 'string', default: DEFAULT_DURATION },
  },
});

try {
  const command = buildRemoteCommand({
    keyHash: hashVirtualKey(process.env.LITELLM_API_KEY),
    models: values.models
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean),
    maxBudget: Number(values['max-budget']),
    duration: values.duration,
  });
  const script = readFileSync(resolve(ROOT, 'infra/scripts/cf-dev-update-virtual-key.py'), 'utf8');
  const result = spawnSync('ssh', ['cf', command], { input: script, encoding: 'utf8' });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exit(result.status ?? 1);
} catch (error) {
  if (error instanceof VirtualKeyError) {
    console.error(`cf:dev:update-vkey: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
