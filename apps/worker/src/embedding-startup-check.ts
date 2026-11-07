import { evaluateEmbeddingConsistency } from '@flow/ai';
import type { EmbeddingModelCounts } from '@flow/db';
import type { Logger } from './logger';

/**
 * Kiểm lệch model embedding khi KHỞI ĐỘNG worker (FR-133): so model đang cấu hình với `embedding_model` của đoạn kiến thức đã xuất bản và
 * `name_embedding_model` của sản phẩm, theo TỪNG workspace chạy pipeline (RLS không cho đọc xuyên workspace). Chỉ LOG, không dừng worker:
 * khi lệch, `loadWorkspaceKnowledge` đã tự tắt nhánh vector (toàn văn/trigram) cho tới khi `kb:reembed` xong. Log không chứa nội dung kiến thức.
 */
export type StartupEmbeddingState = 'off' | 'ok' | 'empty' | 'mismatch' | 'unknown';

export async function checkEmbeddingAtStartup(deps: {
  configuredModel: string | null;
  /** Lý do tắt (từ `EmbeddingConfig.describe.note`): dịch vụ tắt hay DB chưa kích hoạt model. */
  offNote?: string;
  workspaceIds: readonly string[];
  count: (workspaceId: string) => Promise<EmbeddingModelCounts>;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
}): Promise<Array<{ workspaceId: string | null; state: StartupEmbeddingState }>> {
  const { configuredModel, logger } = deps;
  if (configuredModel === null) {
    logger.warn({}, deps.offNote ?? 'embedding TẮT: không có nhánh vector, chỉ toàn văn/trigram');
    return [{ workspaceId: null, state: 'off' }];
  }
  const results: Array<{ workspaceId: string | null; state: StartupEmbeddingState }> = [];
  for (const workspaceId of deps.workspaceIds) {
    try {
      const status = evaluateEmbeddingConsistency({
        configuredModel,
        ...(await deps.count(workspaceId)),
      });
      if (status.state === 'mismatch') {
        logger.error(
          { workspaceId, configuredModel, mismatches: status.mismatches },
          'Model tìm kiếm khác dữ liệu — chạy kb:reembed (nhánh vector đang tắt cho workspace này cho tới khi khớp)',
        );
      } else {
        logger.info(
          { workspaceId, configuredModel, state: status.state },
          'model embedding khớp dữ liệu',
        );
      }
      results.push({ workspaceId, state: status.state });
    } catch {
      logger.error({ workspaceId }, 'không kiểm được model embedding của workspace (lỗi đọc DB)');
      results.push({ workspaceId, state: 'unknown' });
    }
  }
  return results;
}
