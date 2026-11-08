import { loadClassifyConfig } from '../classify/classify-config';
import { createLlmExtractor, type Extractor } from '../classify/extractor';
import { loadDraftConfig } from '../draft/draft-config';
import { createLlmDrafter, type Drafter } from '../draft/drafter';
import { createLlmClient, type LlmClientOptions } from '../llm-client';
import { loadRewriteConfig } from '../rewrite/rewrite-config';
import { createLlmRewriter, type Rewriter } from '../rewrite/rewriter';

/**
 * DÙNG CHUNG cho ô Thử AI (web) và job `pipeline` (worker) — một nơi dựng LLM (PIPE-ORCHESTRATOR lát E).
 * Nối LLM THẬT (qua LiteLLM; nhà cung cấp/model KHÔNG cố định — chọn theo bộ đánh giá, spec 12 §8) vào ô Thử AI (TRY-AI-REAL lát C, FR-027/029/162). Mỗi bước có cờ riêng, MẶC ĐỊNH TẮT
 * (`CLASSIFY_LLM_ENABLED` / `DRAFT_LLM_ENABLED`, chỉ đúng chữ `true`); bật mà thiếu `LITELLM_BASE_URL`/`LITELLM_API_KEY`
 * thì vẫn dùng bản mẫu (không bao giờ gọi mạng thiếu cấu hình). Mọi lần gọi đi qua `createLlmClient`: ghi `ai_usage`
 * (nguyên tắc #7), chỉ nhận văn bản đã che PII (#6); hạn mức tiền do khóa ảo của LiteLLM (`max_budget`) chặn.
 * AI chỉ soạn câu — hành động, độ tin cậy, guard tiền, cổng tự gửi vẫn do code quyết (#3, #4, #9).
 */
export type LlmDeps = {
  extractor?: Extractor;
  drafter?: Drafter;
  rewriter?: Rewriter;
  /** Cờ bật mà thiếu tên model (không có model mặc định): bước đó TẮT. Worker coi là lỗi khởi động; web ghi log + hiện "chưa cấu hình AI". Chỉ có khi có lỗi. */
  configErrors?: string[];
};

type Env = Record<string, string | undefined>;

export type LlmDepsOptions = {
  env: Env;
  /** Chỉ cần `withWorkspace` (ghi `ai_usage`); truyền bản lazy để không dựng DB khi cờ tắt. */
  db: Pick<LlmClientOptions['db'], 'withWorkspace'>;
  fetchImpl?: typeof fetch;
};

export function createLlmDepsFromEnv(options: LlmDepsOptions): LlmDeps {
  const baseUrl = options.env.LITELLM_BASE_URL?.trim();
  const apiKey = options.env.LITELLM_API_KEY?.trim();
  if (!baseUrl || !apiKey) return {};
  const classify = loadClassifyConfig(options.env);
  const draft = loadDraftConfig(options.env);
  const rewrite = loadRewriteConfig(options.env);
  const configErrors = [classify.error, draft.error, rewrite.error].filter(
    (error): error is string => error !== null,
  );
  const errors = configErrors.length > 0 ? { configErrors } : {};
  if (!classify.enabled && !draft.enabled && !rewrite.enabled) return errors;
  const llm = createLlmClient({
    db: options.db as LlmClientOptions['db'],
    baseUrl,
    apiKey,
    fetchImpl: options.fetchImpl,
    // Chỉ siêu dữ liệu an toàn (bước, mã HTTP), không bao giờ nội dung.
    logger: { warn: (fields, message) => console.error(JSON.stringify({ message, ...fields })) },
  });
  return {
    extractor:
      classify.enabled && classify.model
        ? createLlmExtractor({ llm, model: classify.model })
        : undefined,
    drafter:
      draft.enabled && draft.model ? createLlmDrafter({ llm, model: draft.model }) : undefined,
    rewriter:
      rewrite.enabled && rewrite.model
        ? createLlmRewriter({ llm, model: rewrite.model })
        : undefined,
    ...errors,
  };
}
