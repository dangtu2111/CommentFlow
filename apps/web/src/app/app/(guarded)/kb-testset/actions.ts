'use server';

import { createTryQuota } from '@flow/ai';
import { getDb } from '../../../../server/db';
import { createKbTestSetAction, type KbTestSetResult } from '../../../../server/kb-testset';
import { requireAppUser } from '../../../../server/require-app-user';
import { createKnowledgeRunner, isTryAiKbReal } from '../../../../server/try-ai-knowledge';

/** Trạng thái form (đọc bằng `useActionState`). */
export type KbTestSetState = { status: 'idle' } | ({ status: 'done' } & KbTestSetResult);

// Hạn mức: 10 lần chạy/ngày/workspace, đếm trong bộ nhớ tiến trình (Q-KTS1); mỗi lần tối đa 20 câu.
const kbTestSet = createKbTestSetAction({
  quota: createTryQuota({ limit: 10 }),
  // Cùng cờ với ô Thử AI (mặc định TẮT): tắt thì không đụng DB, dùng kiến thức mẫu.
  knowledgeRunner: createKnowledgeRunner({
    enabled: isTryAiKbReal(process.env),
    db: { withActor: (workspaceId, userId, fn) => getDb().withActor(workspaceId, userId, fn) },
  }),
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
