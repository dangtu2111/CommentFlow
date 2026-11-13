import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Bộ câu kiểm thử đã lưu của workspace (migration 0096, KB-TESTSET-PERSIST). `cf_app` chỉ đọc và CHỈ Owner thấy (RLS);
 * ghi qua hàm DEFINER (Owner, `withActor`): thêm một nhóm câu, xóa một câu, ghi kết quả lần chạy cuối. Không lưu lịch sử chạy.
 */
export type KbTestAction = 'answer' | 'clarify' | 'redirect' | 'handoff' | 'skip';
export type KbTestStatus = 'pass' | 'fail' | 'error';

export type KbTestCaseInput = {
  question: string;
  expectAction: KbTestAction;
  replyIncludes: readonly string[];
};

export type KbTestCaseRow = KbTestCaseInput & {
  id: string;
  createdAt: Date;
  lastStatus: KbTestStatus | null;
  lastActual: KbTestAction | null;
  lastReply: string | null;
  lastFailures: string[];
  lastRunAt: Date | null;
};

export type KbTestRunRecord = {
  id: string;
  status: KbTestStatus;
  actual?: KbTestAction | 'skip';
  reply?: string;
  failures: readonly string[];
};

type Row = {
  id: string;
  question: string;
  expect_action: KbTestAction;
  reply_includes: string[];
  created_at: Date | string;
  last_status: KbTestStatus | null;
  last_actual: KbTestAction | null;
  last_reply: string | null;
  last_failures: string[];
  last_run_at: Date | string | null;
};

const asRow = (row: Row): KbTestCaseRow => ({
  id: row.id,
  question: row.question,
  expectAction: row.expect_action,
  replyIncludes: row.reply_includes,
  createdAt: new Date(row.created_at),
  lastStatus: row.last_status,
  lastActual: row.last_actual,
  lastReply: row.last_reply,
  lastFailures: row.last_failures,
  lastRunAt: row.last_run_at ? new Date(row.last_run_at) : null,
});

/** Mọi câu của workspace theo thứ tự thêm. RLS: chỉ Owner thấy (Staff nhận rỗng). */
export async function listKbTestCases(tx: Database, workspaceId: string): Promise<KbTestCaseRow[]> {
  const r = await tx.execute<Row>(sql`
    SELECT id, question, expect_action, reply_includes, created_at,
           last_status, last_actual, last_reply, last_failures, last_run_at
      FROM cf.kb_test_cases
     WHERE workspace_id = ${workspaceId}::uuid
     ORDER BY created_at, id`);
  return r.rows.map(asRow);
}

/** Thêm một nhóm câu (Owner). Trả số câu đã thêm. Quá 100 câu/workspace → 53400; mảng rỗng/quá 20 → 22023; giá trị sai → 23514. */
export async function addKbTestCases(
  tx: Database,
  cases: readonly KbTestCaseInput[],
): Promise<number> {
  const payload = JSON.stringify(
    cases.map((c) => ({
      question: c.question,
      expectAction: c.expectAction,
      replyIncludes: [...c.replyIncludes],
    })),
  );
  const r = await tx.execute<{ n: number }>(
    sql`SELECT cf.add_kb_test_cases(${payload}::jsonb) AS n`,
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Xóa một câu (Owner); câu của workspace khác không bị ảnh hưởng. */
export async function deleteKbTestCase(tx: Database, id: string): Promise<void> {
  await tx.execute(sql`SELECT cf.delete_kb_test_case(${id}::uuid)`);
}

/** Ghi kết quả lần chạy cuối của nhiều câu (Owner). Câu không thuộc workspace bị bỏ qua. */
export async function recordKbTestRun(
  tx: Database,
  records: readonly KbTestRunRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const payload = JSON.stringify(
    records.map((r) => ({
      id: r.id,
      status: r.status,
      actual: r.actual ?? '',
      reply: r.reply ?? '',
      failures: [...r.failures],
    })),
  );
  await tx.execute(sql`SELECT cf.record_kb_test_run(${payload}::jsonb)`);
}
