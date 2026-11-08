import { createEmbeddingResolver, loadEmbeddingService } from '@flow/ai';
import { getEmbeddingState } from '@flow/db/runtime';
import { getDb } from './db';
import {
  createKnowledgeRunner,
  isTryAiKbReal,
  isTryAiProductsReal,
  type KnowledgeRunner,
} from './try-ai-knowledge';
import { createTryLlmDeps, type TryLlmDeps } from './try-ai-llm';

/**
 * Lắp ráp NGUỒN THẬT cho ô Thử AI và bộ câu kiểm thử (dùng chung, không bản mẫu — chủ dự án chốt 08/11):
 * LLM thật qua LiteLLM (cờ `*_LLM_ENABLED`), kiến thức/sản phẩm thật của workspace, embedding theo model hoạt động ở DB (FR-133).
 * Thiếu LLM → `llm_not_configured`; chưa có dữ liệu thật → `no_knowledge`. Mọi kết nối DB tạo lười (next build không có DATABASE_URL).
 */
const embeddingResolver = createEmbeddingResolver({ service: loadEmbeddingService(process.env) });

export function createRealTryLlm(
  env: Record<string, string | undefined> = process.env,
): TryLlmDeps {
  return createTryLlmDeps({
    env,
    db: { withWorkspace: (workspaceId, fn) => getDb().withWorkspace(workspaceId, fn) },
  });
}

export function createRealKnowledgeRunner(
  env: Record<string, string | undefined> = process.env,
): KnowledgeRunner {
  return createKnowledgeRunner({
    enabled: isTryAiKbReal(env),
    productsEnabled: isTryAiProductsReal(env),
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
  });
}
