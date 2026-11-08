import { type ConflictGroup, conflictChunkOf, detectConflicts } from '@flow/ai';
import {
  type Database,
  type FlowDb,
  getCurrentVersion,
  getVersionByNumber,
  type KbVersionRow,
  listChunkSummaries,
  listDraftChunkTexts,
  listKbVersions,
} from '@flow/db/runtime';
import {
  KB_PUBLISH_QUEUE,
  type KbPublishJob,
  type KbVersionPlan,
  planKbVersion,
} from '@flow/shared';
import { getDb } from './db';
import { enqueueJob } from './queue';

/**
 * Xuất bản / khôi phục phiên bản kiến thức (FR-054, UF-8, Q-KPV1). Web chỉ ĐỌC (một giao dịch `withActor`, RLS theo
 * workspace) và xếp job `kb-publish`; ghi `kb_chunks` là việc của worker (RLS chỉ cho hệ thống) — worker kiểm lại Owner.
 * `workspaceId`/`userId` lấy từ `requireAppUser`, không từ client. Kế hoạch được tính lại ở đây (không tin giao diện).
 */
type Ctx = { workspaceId: string; userId: string };
type Ops = {
  listKbVersions: typeof listKbVersions;
  getCurrentVersion: typeof getCurrentVersion;
  getVersionByNumber: typeof getVersionByNumber;
  listChunkSummaries: typeof listChunkSummaries;
  /** Nội dung đoạn nháp để phát hiện mâu thuẫn (cùng hàm với worker khi xuất bản). */
  listDraftChunkTexts?: typeof listDraftChunkTexts;
};
type Deps = {
  db: Pick<FlowDb, 'withActor'>;
  ops: Ops;
  enqueue: (queue: string, data: object) => Promise<void>;
};

export type KbPublishOverview = {
  versions: KbVersionRow[];
  currentNumber: number | null;
  /** So nháp với phiên bản đang chạy (UF-8 "xem thay đổi"). */
  preview: KbVersionPlan;
  /** Nhóm chính sách mâu thuẫn trong bản nháp (số + đơn vị cùng chủ đề), kèm 2 câu + nguồn. */
  conflicts: ConflictGroup[];
};

export type KbPublishResult = 'queued' | 'no_changes' | 'confirm_required' | 'not_found';

export function createKbPublishService({ db, ops, enqueue }: Deps) {
  const currentChunks = async (tx: Database, workspaceId: string) => {
    const current = await ops.getCurrentVersion(tx, workspaceId);
    const chunks = current
      ? await ops.listChunkSummaries(tx, workspaceId, { kind: 'version', versionId: current.id })
      : [];
    return { current, chunks };
  };

  const finish = async (
    plan: KbVersionPlan,
    confirmed: boolean,
    job: KbPublishJob,
  ): Promise<KbPublishResult> => {
    if (!plan.ok) return 'no_changes';
    if ((plan.needsConfirm || job.kind === 'restore') && !confirmed) return 'confirm_required';
    await enqueue(KB_PUBLISH_QUEUE, job);
    return 'queued';
  };

  return {
    overview: (ctx: Ctx): Promise<KbPublishOverview> =>
      db.withActor(ctx.workspaceId, ctx.userId, async (tx: Database) => {
        const [versions, { current, chunks }] = await Promise.all([
          ops.listKbVersions(tx, ctx.workspaceId),
          currentChunks(tx, ctx.workspaceId),
        ]);
        const drafts = await ops.listChunkSummaries(tx, ctx.workspaceId, { kind: 'draft' });
        return {
          versions,
          currentNumber: current?.number ?? null,
          preview: planKbVersion(drafts, chunks),
          conflicts: ops.listDraftChunkTexts
            ? detectConflicts(
                (await ops.listDraftChunkTexts(tx, ctx.workspaceId)).map(conflictChunkOf),
              )
            : [],
        };
      }),

    publish: async (
      ctx: Ctx,
      input: { note: string | null; confirmed: boolean },
    ): Promise<KbPublishResult> => {
      const plan = await db.withActor(ctx.workspaceId, ctx.userId, async (tx: Database) => {
        const { chunks } = await currentChunks(tx, ctx.workspaceId);
        const drafts = await ops.listChunkSummaries(tx, ctx.workspaceId, { kind: 'draft' });
        return planKbVersion(drafts, chunks);
      });
      return finish(plan, input.confirmed, {
        kind: 'publish',
        workspaceId: ctx.workspaceId,
        requestedBy: ctx.userId,
        note: input.note,
      });
    },

    /** `not_found` khi số phiên bản không có trong workspace này (số lạ/workspace khác). */
    restore: async (
      ctx: Ctx,
      input: { versionNumber: number; note: string | null; confirmed: boolean },
    ): Promise<KbPublishResult> => {
      const plan = await db.withActor(ctx.workspaceId, ctx.userId, async (tx: Database) => {
        const target = await ops.getVersionByNumber(tx, ctx.workspaceId, input.versionNumber);
        if (!target) return null;
        const [{ chunks }, next] = await Promise.all([
          currentChunks(tx, ctx.workspaceId),
          ops.listChunkSummaries(tx, ctx.workspaceId, { kind: 'version', versionId: target.id }),
        ]);
        return planKbVersion(next, chunks);
      });
      if (!plan) return 'not_found';
      return finish(plan, input.confirmed, {
        kind: 'restore',
        workspaceId: ctx.workspaceId,
        requestedBy: ctx.userId,
        versionNumber: input.versionNumber,
        note: input.note,
      });
    },
  };
}

export const kbPublish = () =>
  createKbPublishService({
    db: getDb(),
    ops: {
      listKbVersions,
      getCurrentVersion,
      getVersionByNumber,
      listChunkSummaries,
      listDraftChunkTexts,
    },
    enqueue: enqueueJob,
  });
