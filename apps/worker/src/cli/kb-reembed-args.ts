import { z } from 'zod';

/**
 * Đối số CLI `kb:reembed`: `count <workspaceId>` (đếm đoạn theo mô hình embedding) hoặc `enqueue <workspaceId>`
 * (đưa job `kb-reembed` vào hàng đợi). Hàm thuần để test.
 */
export type ReembedCommand = { action: 'count' | 'enqueue'; workspaceId: string };

const USAGE = 'Cách dùng: pnpm --filter @flow/worker kb:reembed -- <count|enqueue> <workspaceId>';

export function parseReembedArgs(argv: readonly string[]): ReembedCommand {
  const args = argv.filter((arg) => arg !== '--');
  const [action, workspaceId] = args;
  if ((action !== 'count' && action !== 'enqueue') || args.length !== 2) throw new Error(USAGE);
  if (!z.uuid().safeParse(workspaceId).success) {
    throw new Error(`workspaceId phải là UUID. ${USAGE}`);
  }
  return { action, workspaceId: workspaceId as string };
}
