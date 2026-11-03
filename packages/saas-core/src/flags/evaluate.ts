import { createHash } from 'node:crypto';

export type FlagKind = 'release' | 'ops' | 'kill_switch' | 'plan';

export type FlagRow = {
  key: string;
  kind: FlagKind;
  defaultOn: boolean;
  rolloutPercent: number;
  plans: string[] | null;
};

export type FlagContext = { workspaceId?: string; plan?: string };

/** Bucket 0–99 ổn định theo (flag, workspace): cùng cặp luôn ra cùng số. */
export function rolloutBucket(flagKey: string, workspaceId: string): number {
  const digest = createHash('sha256').update(`${flagKey}:${workspaceId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

/**
 * Thứ tự quyết định (docs/09 §10, chốt 03/11):
 * kill_switch toàn hệ thống → override theo workspace → gói cước → rollout → default_on.
 *
 * Quy ước CHIỀU NGHĨA của flag `kill_switch`: `default_on = true` = tính năng được phép chạy,
 * `default_on = false` = đang bị chặn toàn hệ thống. Khi đang chặn thì TẮT cho mọi workspace và
 * override `enabled = true` KHÔNG bật lại được; override `enabled = false` vẫn tắt riêng một workspace
 * khi kill_switch không chặn. (Vì thế `isEnabled(..., { failClosed: true })` trả false khi lỗi đọc
 * nghĩa là "không cho chạy".)
 */
export function evaluateFlag(input: {
  flag: FlagRow;
  override?: boolean;
  context: FlagContext;
}): boolean {
  const { flag, override, context } = input;

  if (flag.kind === 'kill_switch') {
    if (!flag.defaultOn) return false;
    return override ?? true;
  }

  if (override !== undefined) return override;

  if (flag.plans && flag.plans.length > 0) {
    if (!context.plan || !flag.plans.includes(context.plan)) return false;
  }

  // Rollout chỉ bật THÊM workspace (default_on = true đã bật tất cả).
  if (flag.defaultOn) return true;
  if (flag.rolloutPercent > 0 && context.workspaceId) {
    return rolloutBucket(flag.key, context.workspaceId) < flag.rolloutPercent;
  }
  return false;
}
