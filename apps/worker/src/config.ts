import { parseEnv } from '@flow/shared';
import { z } from 'zod';

const envSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  WORKER_PORT: z.coerce.number().int().min(0).max(65535).default(3001),
});

export type WorkerConfig = { logLevel: z.infer<typeof envSchema>['LOG_LEVEL']; port: number };

export function loadConfig(source: Record<string, string | undefined> = process.env): WorkerConfig {
  const env = parseEnv(envSchema, source);
  return { logLevel: env.LOG_LEVEL, port: env.WORKER_PORT };
}
