#!/usr/bin/env node
// Dùng: orchestrator start <làn> <bước...> [--config file] [--dry-run]
//       orchestrator validate [--config file] · orchestrator alerts [--config file]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAgent, createFiles, createGh, createGit, realClock } from '../src/adapters.mjs';
import { loadConfig, modelFor } from '../src/config.mjs';
import { startHeartbeat } from '../src/heartbeat.mjs';
import { runJanitorLoop, runJanitorOnce } from '../src/janitor.mjs';
import { createLogger } from '../src/logger.mjs';
import { runLane } from '../src/runner.mjs';
import { describeStep, parseSteps } from '../src/steps.mjs';

function parseArgs(argv) {
  const positional = [];
  const flags = { config: 'orchestrator.config.json', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config') flags.config = argv[++i];
    else if (argv[i] === '--dry-run') flags.dryRun = true;
    else if (argv[i] === '--once') flags.once = true;
    else positional.push(argv[i]);
  }
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, laneName, ...rawSteps] = positional;
  if (!['start', 'validate', 'alerts', 'janitor'].includes(command)) {
    console.error(
      'Dùng: orchestrator start <làn> <task:tên[@mô-hình]|fix:<pr>|wait:<làn>...> | janitor [--once] | validate | alerts',
    );
    return 2;
  }
  const config = loadConfig(flags.config);
  if (command === 'janitor') return runJanitor(config, flags.once || laneName === '--once');
  if (command === 'validate') {
    console.log(`Config hợp lệ: repo ${config.repo}, làn ${Object.keys(config.lanes).join(', ')}`);
    return 0;
  }
  if (command === 'alerts') {
    try {
      process.stdout.write(readFileSync(join(config.stateDir, 'alerts.txt'), 'utf8'));
    } catch {
      console.log('(chưa có cảnh báo)');
    }
    return 0;
  }
  if (!config.lanes[laneName]) {
    console.error(
      `Làn "${laneName}" không có trong config (có: ${Object.keys(config.lanes).join(', ')})`,
    );
    return 2;
  }
  const steps = parseSteps(rawSteps);
  if (flags.dryRun) {
    for (const s of steps) {
      console.log(
        `${describeStep(s)}${s.kind === 'wait' ? '' : ` → mô hình ${modelFor(config, laneName, s)}`}`,
      );
    }
    return 0;
  }
  const { logger, deps } = buildDeps(config, laneName);
  const stopBeat = startHeartbeat({
    lane: laneName,
    intervalMs: config.heartbeat.intervalMinutes * 60_000,
    write: deps.setMarker,
    log: (m) => logger.log(m),
  });
  try {
    const result = await runLane({ config, laneName, steps, deps });
    return result.status === 'done' ? 0 : 1;
  } finally {
    stopBeat();
  }
}

function buildDeps(config, lane) {
  const logger = createLogger({ stateDir: config.stateDir, lane, format: config.log.format });
  const deps = {
    gh: createGh(config),
    git: createGit(config),
    agent: createAgent(config, logger),
    logger,
    ...createFiles(config),
    ...realClock,
  };
  return { logger, deps };
}

// janitor [--once]: quét PR mồ côi mỗi janitor.intervalMinutes phút (Ctrl+C để dừng).
async function runJanitor(config, once) {
  const { logger, deps } = buildDeps(config, 'janitor');
  logger.log(`janitor bắt đầu (làn ${config.janitor.lane ?? 'chưa cấu hình'})`);
  const stopBeat = startHeartbeat({
    lane: 'janitor',
    intervalMs: config.heartbeat.intervalMinutes * 60_000,
    write: deps.setMarker,
    log: (m) => logger.log(m),
  });
  try {
    if (once) await runJanitorOnce({ config, deps });
    else await runJanitorLoop({ config, deps });
  } finally {
    stopBeat();
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e.message);
    process.exit(1);
  },
);
