import { AppError } from '@flow/shared';
import { z } from 'zod';

/**
 * Cấu hình thuần của khóa ảo LiteLLM theo workspace (AI-VIRTUALKEY, FR-034, docs/12 §LiteLLM, docs/13 §4).
 * Ngân sách khóa = trần chi phí AI của workspace (`ai_cost_cap_usd`), cùng nguồn với cổng chi phí.
 */

export const KEY_ALIAS_PREFIX = 'cf-ws-';
/** Chu kỳ đặt lại ngân sách của LiteLLM; chỉ là trần dự phòng, cổng chi phí mới tính đúng tháng UTC. */
export const KEY_BUDGET_DURATION = '1mo';

/** Chỉ đúng chữ `true` mới bật (quy ước cờ môi trường của repo). */
export function isVirtualKeysEnabled(envValue: string | undefined): boolean {
  return envValue === 'true';
}

const workspaceIdSchema = z.uuid();

/** UUID chuẩn hóa chữ thường; sai định dạng → VALIDATION_FAILED. */
export function normalizeWorkspaceId(workspaceId: string): string {
  const parsed = workspaceIdSchema.safeParse(workspaceId);
  if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'workspace_id không hợp lệ.');
  return parsed.data.toLowerCase();
}

/** Alias khóa luôn chứa `workspace_id` (docs/13 §4). */
export function buildKeyAlias(workspaceId: string): string {
  return `${KEY_ALIAS_PREFIX}${normalizeWorkspaceId(workspaceId)}`;
}

export type VirtualKeyBudget = { maxBudgetUsd: number; budgetDuration: string };

/** Số đô hợp lệ: hữu hạn và không âm. */
export function assertValidUsd(value: number, what: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new AppError('VALIDATION_FAILED', `${what} không hợp lệ.`);
  }
}

/** Có trần → ngân sách = trần (kể cả 0); chưa đặt trần → ngân sách mặc định cấu hình. */
export function computeKeyBudget(input: {
  capUsd: number | null;
  defaultBudgetUsd: number;
}): VirtualKeyBudget {
  assertValidUsd(input.defaultBudgetUsd, 'Ngân sách mặc định');
  if (input.capUsd !== null) assertValidUsd(input.capUsd, 'Trần chi phí AI');
  return {
    maxBudgetUsd: input.capUsd ?? input.defaultBudgetUsd,
    budgetDuration: KEY_BUDGET_DURATION,
  };
}
