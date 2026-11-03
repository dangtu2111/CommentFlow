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
 * Thứ tự quyết định (docs/09 §10):
 * override theo workspace → kill_switch toàn hệ thống → gói cước → rollout → default_on.
 * Quy ước CHIỀU NGHĨA của flag `kill_switch`: `true` = tính năng được phép chạy, `false` = đã bị tắt khẩn.
 * (Vì thế `isEnabled(..., { failClosed: true })` trả false khi lỗi đọc nghĩa là "không cho chạy".)
 * Lưu ý: override đứng đầu nên một override "bật" có thể vượt qua kill_switch — công cụ Admin
 * phải cảnh báo khi đặt override cho flag loại kill_switch.
 */
export function evaluateFlag(input: {
  flag: FlagRow;
  override?: boolean;
  context: FlagContext;
}): boolean {
  const { flag, override, context } = input;

  if (override !== undefined) return override;

  if (flag.kind === 'kill_switch') return flag.defaultOn;

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
