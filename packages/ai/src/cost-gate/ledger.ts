import type { FlowDb } from '@flow/db';
import { eq, sql } from '@flow/db';
import { aiUsage } from '@flow/db/schema/cf';
import { workspaces } from '@flow/db/schema/core';
import { AppError } from '@flow/shared';

/**
 * Sổ chi phí (FR-071): đọc tổng chi tháng từ `ai_usage` và trần `workspaces.ai_cost_cap_usd`.
 * Chỉ ĐỌC, qua `withWorkspace` (RLS) — không migration. Tháng tính theo UTC (Q-CG1).
 */

export type CostSnapshot = {
  spentMonthUsd: number;
  /** `null` = chưa đặt trần. */
  capUsd: number | null;
};

export type CostLedger = {
  read(workspaceId: string, now: Date): Promise<CostSnapshot>;
};

/** 00:00 UTC ngày 1 của tháng chứa `now`. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Số đô không âm; hỏng → NaN để cổng bắt thành `invalid_input` (đóng khi không chắc). */
function parseUsd(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

/** Bản DB thật: tổng `cost_usd` từ đầu tháng + trần của workspace, một giao dịch đọc. */
export function createDbCostLedger(db: FlowDb): CostLedger {
  return {
    async read(workspaceId, now) {
      const since = monthStartUtc(now);
      const { spent, cap } = await db.withWorkspace(workspaceId, async (tx) => {
        const [usage] = await tx
          .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
          .from(aiUsage)
          .where(sql`${aiUsage.workspaceId} = ${workspaceId} and ${aiUsage.createdAt} >= ${since}`);
        const [ws] = await tx
          .select({ cap: workspaces.aiCostCapUsd })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId));
        if (!ws) throw new AppError('NOT_FOUND', 'Không thấy workspace.');
        return { spent: usage?.total ?? '0', cap: ws.cap };
      });
      return { spentMonthUsd: parseUsd(spent), capUsd: cap === null ? null : parseUsd(cap) };
    },
  };
}

export type MemoryCostLedger = CostLedger & {
  setCap(workspaceId: string, capUsd: number | null): void;
  addSpend(workspaceId: string, usd: number, at: Date): void;
};

/** Bản bộ nhớ cho test/dev (mock): không DB. */
export function createMemoryCostLedger(): MemoryCostLedger {
  const caps = new Map<string, number | null>();
  const spends = new Map<string, Array<{ usd: number; at: Date }>>();
  return {
    setCap: (workspaceId, capUsd) => void caps.set(workspaceId, capUsd),
    addSpend(workspaceId, usd, at) {
      spends.set(workspaceId, [...(spends.get(workspaceId) ?? []), { usd, at }]);
    },
    async read(workspaceId, now) {
      const since = monthStartUtc(now).getTime();
      const spentMonthUsd = (spends.get(workspaceId) ?? [])
        .filter((s) => s.at.getTime() >= since)
        .reduce((sum, s) => sum + s.usd, 0);
      return { spentMonthUsd, capUsd: caps.get(workspaceId) ?? null };
    },
  };
}
