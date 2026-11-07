import type { TurnBegin, TurnPorts } from '@flow/ai';
import {
  beginPipelineTurn,
  blockPipelineTurn,
  consumeUsage,
  type Database,
  type FlowDb,
  isWorkspaceEmergencyStopped,
  markPipelineTurnCharged,
} from '@flow/db';
import { parseConsumeInput, usagePeriodStart } from '@flow/shared';

/**
 * Cổng lượt của job `pipeline` nối DB thật (PIPE-ORCHESTRATOR lát C, Q-POR3, FR-090). `begin` chạy trong MỘT giao dịch `withJob`:
 *   1. giành quyền xử lý + ghi khóa duy nhất theo `comment_id` (`beginPipelineTurn`);
 *   2. nếu CHƯA từng trừ lượt cho bình luận này → `consume` hạn mức NGAY trong giao dịch đó, rồi ghi `charged_at` (một lần);
 *   3. hết hạn mức → KHÔNG trừ, khóa `blocked`, bình luận "Cần nhân viên".
 * "Đã ghi khóa" và "đã trừ lượt" cùng commit hoặc cùng hoàn tác (lỗi giữa chừng không để khóa mồ côi). Commit TRƯỚC khi gọi LLM.
 * Thử lại sau khi đã trừ (kể cả crash trước khi ghi bản nháp) → xử lý tiếp, không trừ thêm.
 */
export const AI_TURN_PRODUCT = 'commentflow';
export const AI_TURN_METER = 'ai_turns';
/** Khớp `retryLimit` 3 của hàng đợi `pipeline` (docs/09 §9): quá số lần giành quyền này → "Cần nhân viên". */
export const PIPELINE_MAX_ATTEMPTS = 3;

export type TurnConsume = (
  tx: Database,
  input: { workspaceId: string; limit: number; timeZone: string },
) => Promise<{ allowed: boolean }>;

/** Trừ 1 lượt bằng bộ đếm hệ thống (cùng nguyên liệu với `createUsageMeter` của saas-core), chạy trong giao dịch `tx` đang mở. */
export const consumeAiTurn: TurnConsume = async (tx, { workspaceId, limit, timeZone }) => {
  const input = parseConsumeInput({ product: AI_TURN_PRODUCT, meter: AI_TURN_METER, limit });
  const result = await consumeUsage(tx, {
    workspaceId,
    ...input,
    periodStart: usagePeriodStart(new Date(), timeZone),
  });
  return { allowed: result.allowed };
};

export type DbTurnPortsConfig = {
  db: FlowDb;
  workspaceId: string;
  commentId: string;
  /** Hạn mức lượt của kỳ (`resolveAiTurnLimit`). */
  limit: number;
  timeZone: string;
  maxAttempts?: number;
  /** Thuê khi đang xử lý (giây); mặc định của DB. Test đặt 0 để mô phỏng thử lại sau khi lần trước đã kết thúc. */
  leaseSeconds?: number;
  /** Tiêm được để test lỗi giữa chừng; mặc định `consumeAiTurn`. */
  consume?: TurnConsume;
};

/** Cổng lượt kèm token thuê: `attempt()` = số lần thử của CHÍNH job này sau khi giành quyền (null = chưa giành). */
export type DbTurnPorts = TurnPorts & { attempt: () => number | null };

export function createDbTurnPorts(config: DbTurnPortsConfig): DbTurnPorts {
  const { db, workspaceId, commentId } = config;
  let attempt: number | null = null;
  const consume = config.consume ?? consumeAiTurn;
  return {
    attempt: () => attempt,
    emergencyStopped: () =>
      db.withJob(workspaceId, (tx) => isWorkspaceEmergencyStopped(tx, workspaceId)),
    begin: () =>
      db.withJob(workspaceId, async (tx): Promise<TurnBegin> => {
        const turn = await beginPipelineTurn(tx, workspaceId, commentId, {
          maxAttempts: config.maxAttempts ?? PIPELINE_MAX_ATTEMPTS,
          ...(config.leaseSeconds === undefined ? {} : { leaseSeconds: config.leaseSeconds }),
        });
        if (turn.outcome !== 'claimed') return { outcome: turn.outcome };
        attempt = turn.attempts;
        if (turn.alreadyCharged) return { outcome: 'proceed', charged: false };
        const spent = await consume(tx, {
          workspaceId,
          limit: config.limit,
          timeZone: config.timeZone,
        });
        if (!spent.allowed) {
          await blockPipelineTurn(tx, workspaceId, commentId, 'quota_exhausted');
          return { outcome: 'quota_exhausted' };
        }
        await markPipelineTurnCharged(tx, workspaceId, commentId);
        return { outcome: 'proceed', charged: true };
      }),
  };
}
