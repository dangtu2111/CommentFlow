import { AppError } from '@flow/shared';
import type { CostLedger } from '../cost-gate';
import type { VirtualKeyAdmin } from './admin';
import {
  assertValidUsd,
  buildKeyAlias,
  computeKeyBudget,
  normalizeWorkspaceId,
  type VirtualKeyBudget,
} from './config';
import type { VirtualKeyStore } from './store';

/**
 * `resolveKey(workspaceId)` — khóa LiteLLM để gọi LLM cho workspace (AI-VIRTUALKEY, FR-034).
 * Cờ tắt → khóa dùng chung (hành vi cũ). Cờ bật → khóa ảo riêng với `max_budget` = trần chi phí AI;
 * mọi lỗi → ném `AppError` (đóng khi không chắc), KHÔNG rơi về khóa dùng chung vì như vậy vượt ngân sách.
 */

export type VirtualKeyResolverOptions = {
  enabled: boolean;
  /** Khóa dùng chung hiện tại (`LITELLM_API_KEY`), chỉ dùng khi cờ tắt. */
  sharedKey: string;
  /** Ngân sách khi workspace chưa đặt trần (USD). */
  defaultBudgetUsd: number;
  admin: VirtualKeyAdmin;
  store: VirtualKeyStore;
  ledger: CostLedger;
  now?: () => Date;
};

export type VirtualKeyResolver = { resolveKey(workspaceId: string): Promise<string> };

const ISSUE_ERROR_MESSAGE = 'Không cấp được khóa AI cho workspace; tạm không gọi AI.';

export function createVirtualKeyResolver(options: VirtualKeyResolverOptions): VirtualKeyResolver {
  if (options.enabled) assertValidUsd(options.defaultBudgetUsd, 'Ngân sách mặc định');
  const now = options.now ?? (() => new Date());
  const inFlight = new Map<string, Promise<string>>();

  async function ensureKey(workspaceId: string): Promise<string> {
    const snapshot = await options.ledger.read(workspaceId, now());
    const budget: VirtualKeyBudget = computeKeyBudget({
      capUsd: snapshot.capUsd,
      defaultBudgetUsd: options.defaultBudgetUsd,
    });
    const existing = await options.store.get(workspaceId);
    if (existing) {
      if (existing.maxBudgetUsd !== budget.maxBudgetUsd) {
        await options.admin.update(existing.key, { maxBudgetUsd: budget.maxBudgetUsd });
        await options.store.put(workspaceId, {
          key: existing.key,
          maxBudgetUsd: budget.maxBudgetUsd,
        });
      }
      return existing.key;
    }
    const { key } = await options.admin.generate({
      alias: buildKeyAlias(workspaceId),
      maxBudgetUsd: budget.maxBudgetUsd,
      budgetDuration: budget.budgetDuration,
      workspaceId,
    });
    try {
      await options.store.put(workspaceId, { key, maxBudgetUsd: budget.maxBudgetUsd });
    } catch (cause) {
      // Không lưu được → khóa mồ côi; thu hồi tốt-nhất rồi báo lỗi (lần sau cấp lại).
      await options.admin.revoke(key).catch(() => undefined);
      throw cause;
    }
    return key;
  }

  return {
    async resolveKey(rawWorkspaceId) {
      if (!options.enabled) return options.sharedKey;
      const workspaceId = normalizeWorkspaceId(rawWorkspaceId);
      const pending = inFlight.get(workspaceId);
      if (pending) return pending;
      // Một tiến trình, một lần cấp/đồng bộ cho mỗi workspace tại một thời điểm.
      const task = ensureKey(workspaceId)
        .catch((error: unknown) => {
          throw error instanceof AppError
            ? error
            : new AppError('LLM_UNAVAILABLE', ISSUE_ERROR_MESSAGE);
        })
        .finally(() => inFlight.delete(workspaceId));
      inFlight.set(workspaceId, task);
      return task;
    },
  };
}
