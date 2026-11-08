import {
  createEmbeddingResolver,
  createMlReranker,
  loadEmbeddingService,
  loadMlRerankerOptions,
} from '@flow/ai';
import { getEmbeddingState } from '@flow/db/runtime';
import { AI_STEP_FLAGS } from '@flow/shared';
import { getDb } from './db';
import { getFlags } from './flags';
import {
  createKnowledgeRunner,
  isTryAiKbReal,
  isTryAiProductsReal,
  type KnowledgeRunner,
} from './try-ai-knowledge';
import { createTryLlmDeps, type TryLlmDeps } from './try-ai-llm';

/**
 * Lắp ráp NGUỒN THẬT cho ô Thử AI và bộ câu kiểm thử (dùng chung, không bản mẫu — chủ dự án chốt 08/11):
 * LLM thật qua LiteLLM (cờ DB `cf.ai.*` theo workspace), kiến thức/sản phẩm thật của workspace, embedding theo model hoạt động ở DB (FR-133).
 * Thiếu LLM → `llm_missing_service|llm_missing_model|llm_flag_off`; chưa có dữ liệu thật → `no_knowledge`. Mọi kết nối DB tạo lười (next build không có DATABASE_URL).
 */
const embeddingResolver = createEmbeddingResolver({ service: loadEmbeddingService(process.env) });
// Rerank THẬT qua ml (ML_RERANK_ENABLED=true + ML_URL); tắt → quyết định liên quan bằng cosine.
const rerankOptions = loadMlRerankerOptions(process.env);
const reranker = rerankOptions ? createMlReranker(rerankOptions) : undefined;

export function createRealTryLlm(
  env: Record<string, string | undefined> = process.env,
): TryLlmDeps {
  return createTryLlmDeps({
    env,
    db: { withWorkspace: (workspaceId, fn) => getDb().withWorkspace(workspaceId, fn) },
    // Bật/tắt từng bước AI là cờ DB theo workspace (`cf.ai.*`), đọc ở mỗi lần dùng.
    isStepEnabled: (step, workspaceId) =>
      getFlags().isEnabled(AI_STEP_FLAGS[step], { workspaceId }),
    // Cờ bật mà thiếu URL/khóa/tên model: bước đó KHÔNG chạy (Thử AI báo "chưa cấu hình AI"); ghi log rõ nguyên nhân để quản trị sửa cấu hình.
    onMisconfigured: (message) =>
      console.error(JSON.stringify({ event: 'llm_config_invalid', message })),
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
    ...(reranker ? { reranker } : {}),
    onRerankFailure: (error) =>
      console.warn(
        JSON.stringify({
          event: 'try_ai_rerank_failed',
          reason: error instanceof Error ? error.name : 'unknown',
        }),
      ),
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
