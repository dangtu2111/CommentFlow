import { z } from 'zod';
import type { IngestSource } from './ingest-source';

/**
 * MỘT hàm duy nhất quyết định "bình luận này có TỰ chạy pipeline không" (PIPE-ORCHESTRATOR lát E, Q-POR1). `ingest` và job quét
 * cùng gọi hàm này — không viết điều kiện thứ hai. Hàm thuần.
 * - nguồn `backfill` KHÔNG BAO GIỜ tự chạy (FR-011: bình luận lấy ngược khi kết nối chỉ chạy khi nhân viên bấm "Soạn gợi ý");
 * - bình luận của Page / đã xóa không chạy (nguyên tắc #5, FR-048);
 * - cần cờ `PIPELINE_ENABLED` bật VÀ workspace nằm trong `PIPELINE_WORKSPACE_IDS` (danh sách rỗng = không workspace nào).
 */
export type AutoRunInput = {
  workspaceId: string;
  ingestSource: IngestSource;
  isOwn: boolean;
  deleted: boolean;
  flagEnabled: boolean;
  allowedWorkspaceIds: readonly string[];
};

export function shouldAutoRunPipeline(input: AutoRunInput): boolean {
  return (
    input.flagEnabled &&
    input.ingestSource !== 'backfill' &&
    !input.isOwn &&
    !input.deleted &&
    input.allowedWorkspaceIds.includes(input.workspaceId)
  );
}

const uuid = z.uuid();

/** Đọc `PIPELINE_WORKSPACE_IDS` (UUID phân tách bằng dấu phẩy); mục không phải UUID bị bỏ. */
export function parsePipelineWorkspaceIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => uuid.safeParse(part).success);
}
