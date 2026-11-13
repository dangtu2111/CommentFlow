'use server';

import { createTryQuota, TESTSET_MAX_CASES } from '@flow/ai';
import { addKbTestCases, deleteKbTestCase, recordKbTestRun } from '@flow/db/runtime';
import { revalidatePath } from 'next/cache';
import { parseTestSetText } from '../../../../lib/kb-testset-form';
import { actionAllowed } from '../../../../server/action-guard';
import { getDb } from '../../../../server/db';
import { loadKbTestCases } from '../../../../server/kb-test-cases';
import { createKbTestSetAction, type KbTestSetFailure } from '../../../../server/kb-testset';
import { requireAppUser } from '../../../../server/require-app-user';
import { createRealKnowledgeRunner, createRealTryLlm } from '../../../../server/try-ai-runtime';

/** Trạng thái các hành động của Bộ câu kiểm thử (đọc bằng `useActionState`). */
export type LabActionState =
  | { status: 'idle' }
  | { status: 'done'; ok: true; added?: number; quota?: { used: number; limit: number } }
  | {
      status: 'done';
      ok: false;
      reason: KbTestSetFailure | 'rate_limited' | 'too_many_saved';
      line?: number;
    };

const PAGE = '/app/readiness';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOO_MANY_SAVED = '53400';

// Hạn mức: 10 lần chạy/ngày/workspace, đếm trong bộ nhớ tiến trình (Q-KTS1); mỗi lần tối đa 20 câu (bộ lớn hơn chạy thành nhiều lượt).
const kbTestSet = createKbTestSetAction({
  quota: createTryQuota({ limit: 10 }),
  // Cùng nguồn THẬT với ô Thử AI (LLM qua LiteLLM + kiến thức/sản phẩm thật của workspace); thiếu → báo rõ, không bản mẫu.
  llm: createRealTryLlm(process.env),
  knowledgeRunner: createRealKnowledgeRunner(process.env),
});

const errorCode = (error: unknown): string | undefined => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
};

/** Owner thêm câu vào bộ (mỗi dòng "câu hỏi | hành động | từ khóa"). Workspace lấy từ phiên, KHÔNG từ form. */
export async function addTestCasesAction(
  _prev: LabActionState,
  formData: FormData,
): Promise<LabActionState> {
  const { workspace, user } = await requireAppUser({ role: 'owner' });
  const parsed = parseTestSetText(formData.get('cases'));
  if (!parsed.ok) {
    return {
      status: 'done',
      ok: false,
      reason: parsed.reason,
      ...(parsed.reason === 'invalid_line' ? { line: parsed.line } : {}),
    };
  }
  if (!(await actionAllowed('uiWrite', { userId: user.id, workspaceId: workspace.id }))) {
    return { status: 'done', ok: false, reason: 'rate_limited' };
  }
  try {
    const added = await getDb().withActor(workspace.id, user.id, (tx) =>
      addKbTestCases(tx, parsed.cases),
    );
    revalidatePath(PAGE);
    return { status: 'done', ok: true, added };
  } catch (error) {
    return {
      status: 'done',
      ok: false,
      reason: errorCode(error) === TOO_MANY_SAVED ? 'too_many_saved' : 'unavailable',
    };
  }
}

/** Owner xóa một câu khỏi bộ. */
export async function deleteTestCaseAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireAppUser({ role: 'owner' });
  const id = formData.get('id');
  if (typeof id !== 'string' || !UUID.test(id)) return;
  if (!(await actionAllowed('uiWrite', { userId: user.id, workspaceId: workspace.id }))) return;
  await getDb().withActor(workspace.id, user.id, (tx) => deleteKbTestCase(tx, id));
  revalidatePath(PAGE);
}

/**
 * Owner chạy lại TOÀN BỘ bộ đã lưu bằng AI thật (FR-054, US-034), chia lượt ≤ 20 câu; không trừ lượt gói (BR-03).
 * Kết quả từng câu được ghi lại (lần chạy cuối) rồi trang tải lại. Một lượt lỗi thì dừng, kết quả các lượt đã xong vẫn được lưu.
 */
export async function runSavedTestsAction(
  _prev: LabActionState,
  _formData: FormData,
): Promise<LabActionState> {
  const { workspace, user } = await requireAppUser({ role: 'owner' });
  const saved = await loadKbTestCases(workspace.id, user.id);
  if (saved.length === 0) return { status: 'done', ok: false, reason: 'empty' };

  let quota: { used: number; limit: number } | undefined;
  let failure: LabActionState | null = null;
  for (let start = 0; start < saved.length; start += TESTSET_MAX_CASES) {
    const chunk = saved.slice(start, start + TESTSET_MAX_CASES);
    const outcome = await kbTestSet(
      { workspaceId: workspace.id, userId: user.id },
      chunk.map((c) => ({
        question: c.question,
        expectAction: c.expectAction,
        replyIncludes: c.replyIncludes,
      })),
    );
    if (!outcome.ok) {
      failure = {
        status: 'done',
        ok: false,
        reason: outcome.reason,
        ...(outcome.reason === 'invalid_line' ? { line: start + outcome.line } : {}),
      };
      break;
    }
    quota = outcome.quota;
    await getDb().withActor(workspace.id, user.id, (tx) =>
      recordKbTestRun(
        tx,
        outcome.results.map((r) => ({
          id: chunk[r.index]?.id as string,
          status: r.status,
          ...(r.actual ? { actual: r.actual } : {}),
          ...(r.reply ? { reply: r.reply } : {}),
          failures: r.failures,
        })),
      ),
    );
  }
  revalidatePath(PAGE);
  return failure ?? { status: 'done', ok: true, ...(quota ? { quota } : {}) };
}
