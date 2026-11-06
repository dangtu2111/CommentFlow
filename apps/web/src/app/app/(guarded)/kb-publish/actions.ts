'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { parseKbPublishForm } from '../../../../lib/kb-publish-form';
import { kbPublish } from '../../../../server/kb-publish';
import { requireAppUser } from '../../../../server/require-app-user';

/** Trạng thái form xuất bản/khôi phục (đọc bằng `useActionState`). */
export type KbPublishState =
  | { status: 'idle' | 'queued' | 'no_changes' }
  | { status: 'error'; code: 'invalid_note' | 'confirm_required' | 'unavailable' };

/**
 * Xuất bản nháp hoặc khôi phục một phiên bản (FR-054, UF-8). Chỉ Owner (Staff nhận 404); workspace/người dùng từ
 * `requireAppUser`. Số phiên bản lạ hoặc của workspace khác → 404. Chỉ xếp job; worker làm và kiểm lại Owner.
 */
export async function kbPublishAction(
  _prev: KbPublishState,
  data: FormData,
): Promise<KbPublishState> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const parsed = parseKbPublishForm(data);
  if (!parsed.ok) {
    if (parsed.code === 'bad_request') notFound();
    return { status: 'error', code: parsed.code };
  }
  const ctx = { workspaceId: workspace.id, userId: user.id };
  const { action } = parsed;
  let result: 'queued' | 'no_changes' | 'confirm_required' | 'not_found';
  try {
    result =
      action.intent === 'publish'
        ? await kbPublish().publish(ctx, action)
        : await kbPublish().restore(ctx, action);
  } catch {
    return { status: 'error', code: 'unavailable' };
  }
  if (result === 'not_found') notFound();
  if (result === 'confirm_required') return { status: 'error', code: 'confirm_required' };
  revalidatePath('/app/kb-publish');
  return { status: result };
}
