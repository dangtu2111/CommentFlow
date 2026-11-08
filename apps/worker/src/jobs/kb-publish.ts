import { conflictChunkOf, detectConflicts } from '@flow/ai';
import {
  type ChunkScope,
  type CreateKbVersionInput,
  createKbVersionFromChunks,
  type Database,
  type FlowDb,
  getCurrentVersion,
  getVersionByNumber,
  isActiveOwner,
  type KbVersionRef,
  listChunkSummaries,
  listDraftChunkTexts,
  lockKbPublish,
  setDraftConflictMarks,
} from '@flow/db';
import {
  type KbPublishJob,
  kbPublishJobSchema,
  nextVersionNumber,
  type PlanChunk,
  planKbVersion,
} from '@flow/shared';
import type { Logger } from '../logger';
import { type BatchHandler, workspaceJob } from './run-job';

/**
 * Xuất bản / khôi phục phiên bản kiến thức (FR-054, UF-8, Q-KPV1). Một giao dịch `withJob` cho cả "khóa → đọc phiên
 * bản hiện tại → so → tạo phiên bản + sao đoạn", nên hoặc có đủ phiên bản mới hoặc không có gì. Chạy lại an toàn:
 * không còn khác biệt → `no_changes` (không tạo phiên bản thừa). Không ném lỗi nghiệp vụ để pg-boss khỏi thử lại vô ích.
 */
export type KbPublishOutcome =
  | { outcome: 'forbidden' }
  | { outcome: 'version_not_found' }
  | { outcome: 'no_changes' }
  | {
      outcome: 'created';
      number: number;
      copied: number;
      blockedInjection: number;
      conflicts: number;
    };

export type KbPublishOps = {
  /** Gắn cờ mâu thuẫn có cấu trúc lên bản nháp TRƯỚC khi sao sang phiên bản (phiên bản chép nguyên `metadata`); trả số nhóm mâu thuẫn. */
  markConflicts?: (tx: Database, workspaceId: string) => Promise<number>;
  isActiveOwner: (tx: Database, workspaceId: string, userId: string) => Promise<boolean>;
  lock: (tx: Database, workspaceId: string) => Promise<void>;
  getCurrentVersion: (tx: Database, workspaceId: string) => Promise<KbVersionRef | null>;
  getVersionByNumber: (
    tx: Database,
    workspaceId: string,
    n: number,
  ) => Promise<KbVersionRef | null>;
  listChunkSummaries: (
    tx: Database,
    workspaceId: string,
    scope: ChunkScope,
  ) => Promise<PlanChunk[]>;
  createVersion: (
    tx: Database,
    workspaceId: string,
    input: CreateKbVersionInput,
  ) => Promise<{ versionId: string; copied: number }>;
};

/** Phát hiện mâu thuẫn chính sách bằng quy tắc (số + đơn vị cùng chủ đề) và ghi `metadata.conflict_*` lên đoạn nháp. */
export async function markDraftConflicts(tx: Database, workspaceId: string): Promise<number> {
  const rows = await listDraftChunkTexts(tx, workspaceId);
  const groups = detectConflicts(rows.map(conflictChunkOf));
  await setDraftConflictMarks(
    tx,
    workspaceId,
    groups.map((g) => ({
      group: g.group,
      values: g.values,
      chunkKeys: g.members.map((m) => m.chunkKey),
    })),
  );
  return groups.length;
}

export const defaultKbPublishOps: KbPublishOps = {
  markConflicts: markDraftConflicts,
  isActiveOwner,
  lock: lockKbPublish,
  getCurrentVersion,
  getVersionByNumber,
  listChunkSummaries,
  createVersion: createKbVersionFromChunks,
};

export async function runKbPublish(
  tx: Database,
  job: KbPublishJob,
  ops: KbPublishOps,
): Promise<KbPublishOutcome> {
  const { workspaceId } = job;
  if (!(await ops.isActiveOwner(tx, workspaceId, job.requestedBy))) return { outcome: 'forbidden' };

  await ops.lock(tx, workspaceId);
  const current = await ops.getCurrentVersion(tx, workspaceId);
  const currentChunks = current
    ? await ops.listChunkSummaries(tx, workspaceId, { kind: 'version', versionId: current.id })
    : [];

  let scope: ChunkScope = { kind: 'draft' };
  if (job.kind === 'restore') {
    const target = await ops.getVersionByNumber(tx, workspaceId, job.versionNumber);
    if (!target) return { outcome: 'version_not_found' };
    scope = { kind: 'version', versionId: target.id };
  }
  const next = await ops.listChunkSummaries(tx, workspaceId, scope);

  const plan = planKbVersion(next, currentChunks);
  if (!plan.ok) return { outcome: 'no_changes' };

  // Chỉ bản nháp mới tính mâu thuẫn; khôi phục sao đúng phiên bản cũ (giữ nguyên cờ đã có).
  const conflicts =
    scope.kind === 'draft' ? ((await ops.markConflicts?.(tx, workspaceId)) ?? 0) : 0;
  const number = nextVersionNumber(current?.number ?? null);
  const { copied } = await ops.createVersion(tx, workspaceId, {
    number,
    publishedBy: job.requestedBy,
    note: job.note ?? null,
    changedCategories: plan.changedCategories,
    scope,
    keys: plan.publishKeys,
  });
  return {
    outcome: 'created',
    number,
    copied,
    blockedInjection: plan.blockedInjection,
    conflicts,
  };
}

export function createKbPublishHandler(deps: {
  db: FlowDb;
  logger: Logger;
  ops?: KbPublishOps;
}): BatchHandler {
  return workspaceJob({
    db: deps.db,
    schema: kbPublishJobSchema,
    handler: async ({ tx, payload, jobId }) => {
      const result = await runKbPublish(tx, payload, deps.ops ?? defaultKbPublishOps);
      // Chỉ số liệu, không nội dung kiến thức.
      deps.logger.info(
        { jobId, workspaceId: payload.workspaceId, kind: payload.kind, ...result },
        'kb-publish xong',
      );
    },
  });
}
