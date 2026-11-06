'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { parseKbGapForm } from '../../../../lib/kb-gaps-form';
import { kbGaps } from '../../../../server/kb-gaps';
import { requireAppUser } from '../../../../server/require-app-user';

/** Trạng thái một dòng (đọc bằng `useActionState`). */
export type KbGapRowState =
  | { status: 'idle' | 'ok' }
  | { status: 'error'; code: 'invalid_faq' | 'unavailable' };

/**
 * Bổ sung / bỏ qua / mở lại một câu hỏi chưa trả lời được (FR-134, UF-11). Chỉ Owner (Staff nhận 404);
 * workspace lấy từ `requireAppUser`, id gap chỉ được tra TRONG workspace đó — id lạ hoặc của workspace khác → 404.
 */
export async function kbGapAction(_prev: KbGapRowState, data: FormData): Promise<KbGapRowState> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const parsed = parseKbGapForm(data);
  if (!parsed.ok) {
    if (parsed.code === 'bad_request') notFound();
    return { status: 'error', code: parsed.code };
  }
  let result: 'ok' | 'not_found';
  try {
    result = await kbGaps().apply({ workspaceId: workspace.id, userId: user.id }, parsed.action);
  } catch {
    return { status: 'error', code: 'unavailable' };
  }
  if (result === 'not_found') notFound();
  revalidatePath('/app/kb-gaps');
  return { status: 'ok' };
}
