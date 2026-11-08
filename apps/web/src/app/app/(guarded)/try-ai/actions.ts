'use server';

import { createEmbeddingResolver, createTryQuota, loadEmbeddingService } from '@flow/ai';
import { getEmbeddingState } from '@flow/db/runtime';
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

// Dịch vụ ml từ env (chỉ bật/tắt); model hoạt động đọc từ DB mỗi vài giây (nhớ ngắn hạn).
const embeddingResolver = createEmbeddingResolver({ service: loadEmbeddingService(process.env) });

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
    // Model hoạt động đọc từ DB (`cf.embedding_state`); env chỉ bật/tắt dịch vụ ml. Không có embedder giả (FR-133).
    resolveEmbedding: (tx) => embeddingResolver.resolve(() => getEmbeddingState(tx)),
    onEmbeddingFailure: (error) =>
      console.warn(
        JSON.stringify({
          event: 'try_ai_embedding_failed',
          reason: error instanceof Error ? error.name : 'unknown',
        }),
      ),
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
