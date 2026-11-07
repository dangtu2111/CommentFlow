'use server';

import { createMlEmbedder, createTryQuota, loadMlEmbedderOptions } from '@flow/ai';
import { getDb } from '../../../../server/db';
import { requireAppUser } from '../../../../server/require-app-user';
import { createTryAiAction, type TryAiResult } from '../../../../server/try-ai';
import {
  createKnowledgeRunner,
  isTryAiKbReal,
  isTryAiProductsReal,
} from '../../../../server/try-ai-knowledge';
import { createTryLlmDeps } from '../../../../server/try-ai-llm';

/** Trạng thái form (đọc bằng `useActionState`). */
export type TryAiState = { status: 'idle' } | ({ status: 'done' } & TryAiResult);

// Bộ đếm lượt thử/ngày trong bộ nhớ tiến trình (Q-ATB1).
const tryAi = createTryAiAction({
  quota: createTryQuota(),
  // LLM thật (qua LiteLLM, model đổi bằng biến môi trường) chỉ khi bật cờ `CLASSIFY_LLM_ENABLED`/`DRAFT_LLM_ENABLED` + có LITELLM_*; mặc định TẮT.
  llm: createTryLlmDeps({
    env: process.env,
    // Lazy: không dựng kết nối DB lúc nạp module (next build không có DATABASE_URL).
    db: { withWorkspace: (workspaceId, fn) => getDb().withWorkspace(workspaceId, fn) },
  }),
  // Cờ TRY_AI_KB_REAL mặc định TẮT (KB-TRYAI): tắt thì không đụng DB, dùng kiến thức mẫu.
  knowledgeRunner: createKnowledgeRunner({
    enabled: isTryAiKbReal(process.env),
    productsEnabled: isTryAiProductsReal(process.env),
    // Embedding thật (bge-m3 qua dịch vụ ml, miễn phí) chỉ khi ML_EMBED_ENABLED=true + ML_URL; mặc định fixture.
    embedder: (() => {
      const options = loadMlEmbedderOptions(process.env);
      return options ? createMlEmbedder(options) : undefined;
    })(),
    db: { withActor: (workspaceId, userId, fn) => getDb().withActor(workspaceId, userId, fn) },
  }),
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
