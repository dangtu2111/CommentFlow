'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { parseMarkWrongForm } from '../../../../lib/ai-sent-form';
import { aiSentHistory } from '../../../../server/ai-sent-history';
import { requireAppUser } from '../../../../server/require-app-user';

/** Trạng thái một dòng (đọc bằng `useActionState`). */
export type AiSentRowState =
  | { status: 'idle' | 'ok' }
  | { status: 'error'; code: 'already_marked' | 'reason_too_long' | 'unavailable' };

/**
 * Đánh dấu sai một câu AI đã tự gửi (FR-075). Owner và Staff được (docs/13 §3); workspace lấy từ
 * `requireAppUser`; id chỉ được tra TRONG workspace đó — id lạ hoặc của workspace khác → 404.
 */
export async function markWrongAction(
  _prev: AiSentRowState,
  data: FormData,
): Promise<AiSentRowState> {
  const { user, workspace } = await requireAppUser({});
  const parsed = parseMarkWrongForm(data);
  if (!parsed.ok) notFound();
  let result: Awaited<ReturnType<ReturnType<typeof aiSentHistory>['markWrong']>>;
  try {
    result = await aiSentHistory().markWrong(
      { workspaceId: workspace.id, userId: user.id, role: workspace.role },
      parsed.id,
      parsed.reason,
    );
  } catch {
    return { status: 'error', code: 'unavailable' };
  }
  if (result === 'not_found') notFound();
  if (result !== 'ok') return { status: 'error', code: result };
  revalidatePath('/app/ai-sent');
  return { status: 'ok' };
}
