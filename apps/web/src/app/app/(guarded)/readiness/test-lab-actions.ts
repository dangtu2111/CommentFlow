'use server';

import { createTryQuota } from '@flow/ai';
import { createKbTestSetAction, type KbTestSetResult } from '../../../../server/kb-testset';
import { requireAppUser } from '../../../../server/require-app-user';
import { createRealKnowledgeRunner, createRealTryLlm } from '../../../../server/try-ai-runtime';

/** Trạng thái form (đọc bằng `useActionState`). */
export type KbTestSetState = { status: 'idle' } | ({ status: 'done' } & KbTestSetResult);

// Hạn mức: 10 lần chạy/ngày/workspace, đếm trong bộ nhớ tiến trình (Q-KTS1); mỗi lần tối đa 20 câu.
const kbTestSet = createKbTestSetAction({
  quota: createTryQuota({ limit: 10 }),
  // Cùng nguồn THẬT với ô Thử AI (LLM qua LiteLLM + kiến thức/sản phẩm thật của workspace); thiếu → báo rõ, không bản mẫu.
  llm: createRealTryLlm(process.env),
  knowledgeRunner: createRealKnowledgeRunner(process.env),
});

/**
 * Owner chạy bộ câu kiểm thử (FR-054, US-034). Workspace lấy từ `requireAppUser` (chỉ Owner; Staff nhận 404),
 * KHÔNG từ form. Không trừ lượt gói (BR-03); không lưu gì.
 */
export async function runKbTestSetAction(
  _prev: KbTestSetState,
  formData: FormData,
): Promise<KbTestSetState> {
  const { workspace, user } = await requireAppUser({ role: 'owner' });
  const result = await kbTestSet(
    { workspaceId: workspace.id, userId: user.id },
    formData.get('cases'),
  );
  return { status: 'done', ...result };
}
