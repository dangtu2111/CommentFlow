import type { IngestSource } from './ingest-source';

/**
 * MỘT hàm duy nhất quyết định "bình luận này có TỰ chạy pipeline không" (PIPE-ORCHESTRATOR lát E, Q-POR1; cờ DB từ PIPE-FLAG-V2). `ingest`, job quét và job
 * `pipeline` cùng gọi hàm này — không viết điều kiện thứ hai. Hàm thuần.
 * - nguồn `backfill` KHÔNG BAO GIỜ tự chạy (FR-011: bình luận lấy ngược khi kết nối chỉ chạy khi nhân viên bấm "Soạn gợi ý");
 * - bình luận của Page / đã xóa không chạy (nguyên tắc #5, FR-048);
 * - cần cờ DB `cf.pipeline.v2` (`PIPELINE_FLAG`) BẬT cho workspace (`enabled`, nơi gọi đọc cờ theo workspace qua `saas-core/flags`).
 */
export type AutoRunInput = {
  ingestSource: IngestSource;
  isOwn: boolean;
  deleted: boolean;
  /** Cờ `cf.pipeline.v2` đang bật cho workspace của bình luận. */
  enabled: boolean;
};

export function shouldAutoRunPipeline(input: AutoRunInput): boolean {
  return input.enabled && input.ingestSource !== 'backfill' && !input.isOwn && !input.deleted;
}
