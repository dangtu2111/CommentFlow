'use server';

import { approvePolicyFact, discardPolicyDraft } from '@flow/db/runtime';
import { redirect } from 'next/navigation';
import { type PolicyNotice, parsePolicyActionForm } from '../../../../lib/kb-policy-notice';
import { actionAllowed } from '../../../../server/action-guard';
import { getDb } from '../../../../server/db';
import { requireAppUser } from '../../../../server/require-app-user';

/**
 * Duyệt / Bỏ giá trị chính sách có cấu trúc (ADR 017) — chỉ Owner (Staff nhận 404 ở `requireAppUser`, gọi đầu MỖI action). Workspace và người dùng lấy từ phiên;
 * `id`/`rev` từ form chỉ là lựa chọn (id lạ hoặc của workspace khác → RLS giấu → `not_found`; `rev` lệch → `stale`, không ghi). Kết thúc chuyển hướng về trang kèm `?pn=`.
 */
const BACK = '/app/kb/policies';

const APPROVE_NOTICE = {
  approved: 'approved',
  stale: 'stale',
  not_found: 'not_found',
  needs_review: 'needs_review',
} as const satisfies Record<string, PolicyNotice>;

const DISCARD_NOTICE = {
  discarded: 'discarded',
  stale: 'stale',
  not_found: 'not_found',
} as const satisfies Record<string, PolicyNotice>;

async function run(
  data: FormData,
  session: { workspaceId: string; userId: string },
  act: (
    tx: Parameters<Parameters<ReturnType<typeof getDb>['withActor']>[2]>[0],
    input: { workspaceId: string; id: string; rev: number; confirm: boolean },
  ) => Promise<PolicyNotice>,
): Promise<never> {
  const form = parsePolicyActionForm(data);
  if (!form.ok) redirect(`${BACK}?pn=invalid`);
  // Chống bấm đúp/spam: lần thứ hai trong cùng khoảnh khắc (hoặc quá 30 lần/phút) bị chặn, KHÔNG ghi gì.
  if (!(await actionAllowed('uiWrite', session))) redirect(`${BACK}?pn=rate_limited`);
  let notice: PolicyNotice;
  try {
    notice = await getDb().withActor(session.workspaceId, session.userId, (tx) =>
      act(tx, {
        workspaceId: session.workspaceId,
        id: form.id,
        rev: form.rev,
        confirm: form.confirm,
      }),
    );
  } catch {
    console.error(JSON.stringify({ event: 'policy_facts_write_failed' }));
    notice = 'unavailable';
  }
  redirect(`${BACK}?pn=${notice}`);
}

export async function approvePolicyAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  return run(data, { workspaceId: workspace.id, userId: user.id }, async (tx, input) => {
    const result = await approvePolicyFact(tx, input.workspaceId, input.id, input.rev, {
      confirmReview: input.confirm,
    });
    return APPROVE_NOTICE[result];
  });
}

export async function discardPolicyDraftAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  return run(data, { workspaceId: workspace.id, userId: user.id }, async (tx, input) => {
    const result = await discardPolicyDraft(tx, input.workspaceId, input.id, input.rev);
    return DISCARD_NOTICE[result];
  });
}
