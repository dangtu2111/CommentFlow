import {
  createTurnGate,
  isUnreadableAiOutput,
  type PersistContext,
  type PipelineDeps,
  type PipelineInput,
  runPipeline,
} from '@flow/ai';
import { extendPipelineTurnLease, type FlowDb, releasePipelineTurn } from '@flow/db';
import { persistHandoff, persistPipelineResult } from './pipeline-persist';
import { createDbTurnPorts, type DbTurnPortsConfig } from './pipeline-turn';

/**
 * Chạy TRỌN MỘT bình luận (PIPE-ORCHESTRATOR lát D): cổng lượt → pipeline → ghi kết quả. Chưa có job/hàng đợi (lát E).
 *
 * Kết cục:
 * - `written`: đã ghi bản nháp (pending_review/needs_human theo quyết định của code).
 * - `handoff`: ghi "Cần nhân viên" (hết lượt, hết lần thử, AI lỗi/đầu ra không đọc được) — bình luận không kẹt.
 * - `skipped`: bị lọc quy tắc (emoji/tag…), không ghi, không trừ lượt (FR-024).
 * - `deferred`: dừng khẩn cấp (bình luận GIỮ `new`, Q-POR7), `busy` (job khác đang xử lý), `already_handled` — không ghi gì.
 * Lỗi tạm (cổng lỗi, hạ tầng) → nhả thuê và NÉM lại để pg-boss thử lại.
 */
export type RunCommentOutcome =
  | { kind: 'written'; draftId: string | null }
  | { kind: 'handoff'; reason: string }
  | { kind: 'skipped'; reason: string }
  | { kind: 'deferred'; reason: 'emergency_stop' | 'busy' | 'already_handled' };

/** Thuê mặc định của khóa lượt (giây) — mỗi lời gọi LLM gia hạn lại để tổng thời gian một lượt không vượt thuê (Q-POR6). */
export const TURN_LEASE_SECONDS = 120;

/** Job đã mất thuê (hết hạn, job khác giành lại): dừng ngay để không gọi LLM trùng/ghi chồng; pg-boss thử lại sau. */
export class LeaseLostError extends Error {
  constructor() {
    super('Mất thuê lượt pipeline');
    this.name = 'LeaseLostError';
  }
}

export type RunCommentConfig = {
  db: FlowDb;
  workspaceId: string;
  commentId: string;
  turn: Omit<DbTurnPortsConfig, 'db' | 'workspaceId' | 'commentId'>;
  input: PipelineInput;
  deps: Omit<PipelineDeps, 'gate'>;
  persist: PersistContext;
  now?: () => number;
};

export async function runCommentPipeline(config: RunCommentConfig): Promise<RunCommentOutcome> {
  const { db, workspaceId, commentId } = config;
  const now = config.now ?? Date.now;
  const ports = createDbTurnPorts({ db, workspaceId, commentId, ...config.turn });
  const gate = createTurnGate(ports);
  // Gia hạn CHỈ khi còn là chủ thuê (token = số lần thử của chính job); mất thuê → dừng, không ghi, không đụng thuê của job khác.
  const extend = async () => {
    const attempt = ports.attempt();
    const owned =
      attempt !== null &&
      (await db.withJob(workspaceId, (tx) =>
        extendPipelineTurnLease(tx, workspaceId, commentId, attempt, TURN_LEASE_SECONDS),
      ));
    if (!owned) throw new LeaseLostError();
  };
  // Gia hạn thuê TRƯỚC mỗi lời gọi LLM (extract / rewrite / draft).
  const { extractor, drafter, rewriter } = config.deps;
  const deps: PipelineDeps = {
    ...config.deps,
    extractor: {
      extract: async (i) => {
        await extend();
        return extractor.extract(i);
      },
    },
    drafter: {
      draft: async (i) => {
        await extend();
        return drafter.draft(i);
      },
    },
    ...(rewriter
      ? {
          rewriter: {
            rewrite: async (i) => {
              await extend();
              return rewriter.rewrite(i);
            },
          },
        }
      : {}),
    gate,
  };

  const started = now();
  let result: Awaited<ReturnType<typeof runPipeline>>;
  try {
    result = await runPipeline(config.input, deps);
  } catch (error) {
    if (isUnreadableAiOutput(error)) {
      await persistHandoff(db, workspaceId, 'ai_invalid_output', config.persist, {
        markFailed: true,
      });
      return { kind: 'handoff', reason: 'ai_invalid_output' };
    }
    if (!(error instanceof LeaseLostError)) {
      const attempt = ports.attempt() ?? undefined;
      await db.withJob(workspaceId, (tx) =>
        releasePipelineTurn(tx, workspaceId, commentId, 'transient_error', attempt),
      );
    }
    throw error;
  }

  if (result.status === 'skipped') return { kind: 'skipped', reason: result.reason };
  if (result.status === 'blocked') {
    switch (result.reason) {
      case 'emergency_stop':
      case 'busy':
      case 'already_handled':
        return { kind: 'deferred', reason: result.reason };
      case 'quota_exhausted':
      case 'attempts_exhausted':
        await persistHandoff(db, workspaceId, result.reason, config.persist);
        return { kind: 'handoff', reason: result.reason };
      default:
        // gate_error và lý do lạ: chặn an toàn → thử lại (không nuốt lỗi).
        throw new Error(`pipeline bị chặn: ${result.reason}`);
    }
  }
  const out = await persistPipelineResult(db, workspaceId, result, config.persist, now() - started);
  return { kind: 'written', draftId: out.written ? out.draftId : null };
}
