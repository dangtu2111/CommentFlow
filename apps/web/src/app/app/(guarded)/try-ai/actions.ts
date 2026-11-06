'use server';

import { createTryQuota } from '@flow/ai';
import { requireAppUser } from '../../../../server/require-app-user';
import { createTryAiAction, type TryAiResult } from '../../../../server/try-ai';

/** Trạng thái form (đọc bằng `useActionState`). */
export type TryAiState = { status: 'idle' } | ({ status: 'done' } & TryAiResult);

// Bộ đếm lượt thử/ngày trong bộ nhớ tiến trình (Q-ATB1).
const tryAi = createTryAiAction({ quota: createTryQuota() });

/**
 * Owner thử AI với một bình luận mẫu (FR-059, US-034). Workspace lấy từ `requireAppUser` (chỉ Owner; Staff nhận
 * 404), KHÔNG từ form. Không trừ lượt gói (BR-03); không lưu bình luận/bản nháp.
 */
export async function runTryAiAction(_prev: TryAiState, formData: FormData): Promise<TryAiState> {
  const { workspace } = await requireAppUser({ role: 'owner' });
  const result = await tryAi({ workspaceId: workspace.id }, formData.get('text'));
  return { status: 'done', ...result };
}
