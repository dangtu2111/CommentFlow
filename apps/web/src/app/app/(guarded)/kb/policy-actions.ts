'use server';

import {
  approvePolicyFact,
  deleteApprovedPolicyFact,
  discardPolicyDraft,
  editPolicyDraft,
  listAllPolicyFacts,
  listPolicyItems,
  refreshPolicySuggestions,
  savePolicyFact,
} from '@flow/db/runtime';
import { redirect } from 'next/navigation';
import { analyzePolicyTexts } from '../../../../lib/kb-policy-analyze';
import { formToPolicyData } from '../../../../lib/kb-policy-form';
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
  invalid: 'invalid',
} as const satisfies Record<string, PolicyNotice>;

const DISCARD_NOTICE = {
  discarded: 'discarded',
  stale: 'stale',
  not_found: 'not_found',
} as const satisfies Record<string, PolicyNotice>;

const DELETE_NOTICE = {
  deleted: 'deleted',
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

export async function deleteApprovedPolicyAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  return run(data, { workspaceId: workspace.id, userId: user.id }, async (tx, input) => {
    const result = await deleteApprovedPolicyFact(tx, input.workspaceId, input.id, input.rev);
    return DELETE_NOTICE[result];
  });
}

/**
 * Sửa tay / Thêm giá trị: luôn ghi thành NHÁP của Owner (`origin = 'manual'`); muốn áp dụng cho AI phải bấm Duyệt (so sánh bản mới với bản đang duyệt ở khối nháp).
 * Đang có nháp cùng (kind, slot) → thay tại chỗ bằng `editPolicyDraft` (nháp của máy thành nháp "đã sửa tay"). Trạng thái nháp lúc mở biểu mẫu (`draftId` + `rev`, hoặc không có) phải khớp lúc lưu,
 * lệch → `stale` (không ghi đè nháp mới của máy/người khác).
 */
export async function savePolicyValueAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const parsed = formToPolicyData(data);
  if (!parsed.ok) redirect(`${BACK}?pn=invalid`);
  const draftId = typeof data.get('draftId') === 'string' ? (data.get('draftId') as string) : '';
  const rev = Number(data.get('rev'));
  const session = { workspaceId: workspace.id, userId: user.id };
  if (!(await actionAllowed('uiWrite', session))) redirect(`${BACK}?pn=rate_limited`);
  let notice: PolicyNotice;
  try {
    notice = await getDb().withActor(session.workspaceId, session.userId, async (tx) => {
      const rows = await listAllPolicyFacts(tx, session.workspaceId);
      const existing = rows.find(
        (row) => row.kind === parsed.kind && row.slot === parsed.slot && row.status === 'draft',
      );
      if (existing === undefined) {
        // Mở biểu mẫu từ một nháp nay không còn (đã duyệt/bỏ) → lệch trạng thái.
        if (draftId !== '') return 'stale';
        await savePolicyFact(tx, {
          workspaceId: session.workspaceId,
          kind: parsed.kind,
          slot: parsed.slot,
          data: parsed.data,
          status: 'draft',
          origin: 'manual',
          evidence: null,
          sourceRef: null,
          createdBy: session.userId,
        });
        return 'saved';
      }
      if (existing.id !== draftId || existing.rev !== rev) return 'stale';
      const result = await editPolicyDraft(
        tx,
        session.workspaceId,
        existing.id,
        existing.rev,
        parsed.data,
        session.userId,
      );
      return result === 'edited' ? 'saved' : result === 'stale' ? 'stale' : 'not_found';
    });
  } catch {
    console.error(JSON.stringify({ event: 'policy_facts_write_failed' }));
    notice = 'unavailable';
  }
  redirect(`${BACK}?pn=${notice}`);
}

/**
 * Phân tách DỮ LIỆU THÔ (chính sách văn bản đã nạp) thành giá trị có cấu trúc: đọc `policy_items`, chạy bộ đề xuất thuần, làm mới các bản nháp nguồn `text_suggested` (không đụng bản đã duyệt hay
 * nháp Owner đã sửa tay). Chỉ Owner. Kết quả: `?pn=analyzed&pc=<số nháp>`; không có giá trị mới → `analyzed_none`; chưa có văn bản thô → `no_raw`.
 */
export async function analyzePolicyTextAction(): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const session = { workspaceId: workspace.id, userId: user.id };
  if (!(await actionAllowed('uiWrite', session))) redirect(`${BACK}?pn=rate_limited`);
  let target = `${BACK}?pn=unavailable`;
  try {
    target = await getDb().withActor(session.workspaceId, session.userId, async (tx) => {
      const items = await listPolicyItems(tx, session.workspaceId);
      const { textCount, suggestions } = analyzePolicyTexts(items);
      if (textCount === 0) return `${BACK}?pn=no_raw`;
      const { drafted } = await refreshPolicySuggestions(
        tx,
        session.workspaceId,
        'text_suggested',
        suggestions,
        'policy_items',
      );
      return drafted === 0 ? `${BACK}?pn=analyzed_none` : `${BACK}?pn=analyzed&pc=${drafted}`;
    });
  } catch {
    console.error(JSON.stringify({ event: 'policy_facts_analyze_failed' }));
  }
  redirect(target);
}
