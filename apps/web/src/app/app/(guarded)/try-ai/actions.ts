'use server';

import { createTryQuota } from '@flow/ai';
import { requireAppUser } from '../../../../server/require-app-user';
import { createTryAiAction, type TryAiResult } from '../../../../server/try-ai';
import { createRealKnowledgeRunner, createRealTryLlm } from '../../../../server/try-ai-runtime';

/** Trạng thái form (đọc bằng `useActionState`). */
export type TryAiState = { status: 'idle' } | ({ status: 'done' } & TryAiResult);

// Bộ đếm lượt thử/ngày trong bộ nhớ tiến trình (Q-ATB1).
const tryAi = createTryAiAction({
  quota: createTryQuota(),
  // LLM THẬT (LiteLLM, cờ DB `cf.ai.classify`/`cf.ai.draft` theo workspace) + kiến thức THẬT của workspace; thiếu → báo rõ, không bản mẫu.
  llm: createRealTryLlm(process.env),
  knowledgeRunner: createRealKnowledgeRunner(process.env),
});

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
