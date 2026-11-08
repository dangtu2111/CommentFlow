import { AppError } from '@flow/shared';

export type SwitchCommand = { action: 'status' } | { action: 'switch'; model: string };

const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,99}$/;

/** `kb:switch-embedding -- <model>` hoặc `-- --status`. Model lấy từ tham số (KHÔNG từ env). */
export function parseSwitchArgs(argv: readonly string[]): SwitchCommand {
  const args = argv.filter((a) => a !== '--');
  if (args.length === 1 && args[0] === '--status') return { action: 'status' };
  const [model, ...rest] = args;
  if (!model || rest.length > 0 || !MODEL.test(model)) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Cách dùng: kb:switch-embedding -- <model>  (ví dụ bge-m3)  |  kb:switch-embedding -- --status',
    );
  }
  return { action: 'switch', model };
}
