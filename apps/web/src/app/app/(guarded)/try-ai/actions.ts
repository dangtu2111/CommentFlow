'use server';

import { requireAppUser } from '../../../../server/require-app-user';
import type { TryAiResult } from '../../../../server/try-ai';
import { tryAi } from '../../../../server/try-ai-instance';

/** Trạng thái form (đọc bằng `useActionState`). */
export type TryAiState = { status: 'idle' } | ({ status: 'done' } & TryAiResult);

/**
 * Owner thử AI với một bình luận mẫu (FR-059, US-034). Workspace lấy từ `requireAppUser` (chỉ Owner; Staff nhận
 * 404), KHÔNG từ form. Không trừ lượt gói (BR-03); không lưu bình luận/bản nháp.
 */
export async function runTryAiAction(_prev: TryAiState, formData: FormData): Promise<TryAiState> {
  const { workspace, user } = await requireAppUser({ role: 'owner' });
  const result = await tryAi(
    { workspaceId: workspace.id, userId: user.id },
    formData.get('text'),
    formData.get('previous'),
  );
  return { status: 'done', ...result };
}
