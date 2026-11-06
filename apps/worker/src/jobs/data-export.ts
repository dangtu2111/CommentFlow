import { createHash, randomUUID } from 'node:crypto';
import {
  claimDataExport,
  completeDataExport,
  type Database,
  type FlowDb,
  failDataExport,
  isActiveOwner,
  readAutomationSettings,
  readCommentsPage,
  readKbChunksPage,
  readLeadsPage,
  readRulesPage,
} from '@flow/db';
import {
  AppError,
  type AutomationSettingsExportSource,
  type CommentExportSource,
  DATA_EXPORT_MAX_ROWS_PER_SECTION,
  DATA_EXPORT_PAGE_SIZE,
  type DataExportJob,
  type DataExportSection,
  dataExportJobSchema,
  exportExpiresAt,
  exportFileKey,
  exportLine,
  type KbChunkExportSource,
  type LeadExportSource,
  type RuleExportSource,
  shapeAutomationSettingsRow,
  shapeCommentRow,
  shapeKbChunkRow,
  shapeLeadRow,
  shapeRuleRow,
} from '@flow/shared';
import type { Job } from 'pg-boss';
import type { ExportFileStore } from '../export-store';
import type { Logger } from '../logger';
import type { BatchHandler } from './run-job';

/**
 * Xuất dữ liệu workspace (FR-094, Q-EXP1). Mỗi bước một giao dịch ngắn `withJob`: (1) kiểm Owner + nhận việc
 * (pending → running; không còn pending thì bỏ qua nên chạy lại không xuất hai lần), (2) đọc từng trang theo khóa `id`,
 * che PII, ghi tuần tự vào kho tệp, (3) đánh dấu `ready` + hạn 7 ngày. Lỗi nghiệp vụ/ghi tệp KHÔNG ném (pg-boss khỏi
 * thử lại vô ích): yêu cầu thành `failed` với mã cố định; log chỉ có tên lỗi, không có nội dung (có thể chứa PII).
 */
export type DataExportOutcome =
  | { outcome: 'forbidden' }
  | { outcome: 'skipped' }
  | { outcome: 'failed' }
  | { outcome: 'ready'; counts: Record<string, number>; truncated: DataExportSection[] };

type Page<T> = { rows: T[]; lastId: string | null };
type PageReader<T> = (
  tx: Database,
  workspaceId: string,
  afterId: string | null,
  limit: number,
) => Promise<Page<T>>;

export type DataExportOps = {
  isActiveOwner: (tx: Database, workspaceId: string, userId: string) => Promise<boolean>;
  claim: typeof claimDataExport;
  complete: typeof completeDataExport;
  fail: typeof failDataExport;
  readComments: PageReader<CommentExportSource>;
  readLeads: PageReader<LeadExportSource>;
  readKbChunks: PageReader<KbChunkExportSource>;
  readRules: PageReader<RuleExportSource>;
  readAutomationSettings: (
    tx: Database,
    workspaceId: string,
  ) => Promise<AutomationSettingsExportSource | null>;
};

export const defaultDataExportOps: DataExportOps = {
  isActiveOwner,
  claim: claimDataExport,
  complete: completeDataExport,
  fail: failDataExport,
  readComments: readCommentsPage,
  readLeads: readLeadsPage,
  readKbChunks: readKbChunksPage,
  readRules: readRulesPage,
  readAutomationSettings,
};

export type DataExportDeps = {
  db: Pick<FlowDb, 'withJob'>;
  ops: DataExportOps;
  store: ExportFileStore;
  logger: Pick<Logger, 'info' | 'error'>;
  now: () => Date;
  /** Muối của mã giả người dùng nền tảng (khác nhau giữa các lần xuất để không nối được hai tệp). */
  salt: string;
  pageSize?: number;
  maxRows?: number;
};

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

/** Mã giả ổn định trong một tệp: `kh_` + 16 hex đầu của SHA-256(muối : workspace : id nền tảng). */
function pseudonymizer(salt: string, workspaceId: string): (value: string) => string {
  return (value) =>
    `kh_${createHash('sha256').update(`${salt}:${workspaceId}:${value}`).digest('hex').slice(0, 16)}`;
}

async function* buildLines(
  deps: DataExportDeps,
  job: DataExportJob,
  counts: Record<string, number>,
  truncated: DataExportSection[],
): AsyncGenerator<string> {
  const { workspaceId } = job;
  const pageSize = deps.pageSize ?? DATA_EXPORT_PAGE_SIZE;
  const maxRows = deps.maxRows ?? DATA_EXPORT_MAX_ROWS_PER_SECTION;
  const pseudonym = pseudonymizer(deps.salt, workspaceId);

  yield exportLine('meta', {
    export_id: job.exportId,
    workspace_id: workspaceId,
    generated_at: deps.now().toISOString(),
    pii_policy: 'masked',
    format: 'jsonl',
  });

  async function* paged<T, S>(
    section: DataExportSection,
    read: PageReader<T>,
    shape: (row: T) => S,
  ): AsyncGenerator<string> {
    counts[section] = 0;
    let afterId: string | null = null;
    for (;;) {
      const remaining = maxRows - (counts[section] ?? 0);
      const limit = Math.min(pageSize, remaining);
      const page: Page<T> = await deps.db.withJob(workspaceId, (tx) =>
        read(tx, workspaceId, afterId, limit),
      );
      for (const row of page.rows.slice(0, limit)) {
        counts[section] = (counts[section] ?? 0) + 1;
        yield exportLine(section, shape(row) as object);
      }
      if (page.lastId === null || page.rows.length < limit) return;
      if ((counts[section] ?? 0) >= maxRows) {
        truncated.push(section);
        return;
      }
      afterId = page.lastId;
    }
  }

  yield* paged('comments', deps.ops.readComments, (r) => shapeCommentRow(r, pseudonym));
  yield* paged('leads', deps.ops.readLeads, shapeLeadRow);
  yield* paged('kb_chunks', deps.ops.readKbChunks, shapeKbChunkRow);

  const settings = await deps.db.withJob(workspaceId, (tx) =>
    deps.ops.readAutomationSettings(tx, workspaceId),
  );
  counts.automation_settings = settings ? 1 : 0;
  if (settings) yield exportLine('automation_settings', shapeAutomationSettingsRow(settings));

  yield* paged('rules', deps.ops.readRules, shapeRuleRow);

  yield exportLine('summary', { counts: { ...counts }, truncated: [...truncated] });
}

export async function runDataExport(
  deps: DataExportDeps,
  job: DataExportJob,
): Promise<DataExportOutcome> {
  const { workspaceId, exportId } = job;

  const start = await deps.db.withJob(workspaceId, async (tx) => {
    if (!(await deps.ops.isActiveOwner(tx, workspaceId, job.requestedBy))) {
      await deps.ops.fail(tx, workspaceId, exportId, 'forbidden');
      return 'forbidden' as const;
    }
    return (await deps.ops.claim(tx, workspaceId, exportId))
      ? ('go' as const)
      : ('skipped' as const);
  });
  if (start !== 'go') return { outcome: start };

  const key = exportFileKey(workspaceId, exportId);
  const counts: Record<string, number> = {};
  const truncated: DataExportSection[] = [];
  try {
    const { bytes } = await deps.store.put(key, buildLines(deps, job, counts, truncated));
    await deps.db.withJob(workspaceId, (tx) =>
      deps.ops.complete(tx, workspaceId, exportId, {
        fileKey: key,
        sizeBytes: bytes,
        rowCounts: counts,
        expiresAt: exportExpiresAt(deps.now()),
      }),
    );
    return { outcome: 'ready', counts, truncated };
  } catch (error) {
    deps.logger.error({ workspaceId, exportId, error: errorName(error) }, 'xuất dữ liệu lỗi');
    await deps.store.remove(key).catch(() => undefined);
    await deps.db.withJob(workspaceId, (tx) =>
      deps.ops.fail(tx, workspaceId, exportId, 'export_failed'),
    );
    return { outcome: 'failed' };
  }
}

export function createDataExportHandler(deps: {
  db: FlowDb;
  logger: Logger;
  store: ExportFileStore;
  now?: () => Date;
  ops?: DataExportOps;
}): BatchHandler {
  // Không dùng `workspaceJob`/`systemJob`: chúng bọc cả job trong MỘT giao dịch dài, còn xuất dữ liệu tự mở từng bước ngắn.
  return async (jobs: Job<unknown>[]) => {
    for (const job of jobs) {
      const parsed = dataExportJobSchema.safeParse(job.data);
      // Không đưa dữ liệu job vào thông báo (an toàn mặc định).
      if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'Dữ liệu job không hợp lệ.');
      const result = await runDataExport(
        {
          db: deps.db,
          ops: deps.ops ?? defaultDataExportOps,
          store: deps.store,
          logger: deps.logger,
          now: deps.now ?? (() => new Date()),
          salt: randomUUID(),
        },
        parsed.data,
      );
      deps.logger.info(
        { jobId: job.id, workspaceId: parsed.data.workspaceId, outcome: result.outcome },
        'data-export xong',
      );
    }
  };
}
