import { AppError } from '@flow/shared';
import { z } from 'zod';

/**
 * Reranker THẬT qua dịch vụ `ml` (bge-reranker-v2-m3 — docs/09 §2): cross-encoder chấm ĐIỂM TUYỆT ĐỐI 0..1 cho từng cặp (câu hỏi, đoạn), dùng để
 * quyết định đoạn kiến thức có "đủ liên quan" (điểm RRF chỉ để xếp thứ tự). Gọi `POST {ML_URL}/rerank`; có `ML_API_TOKEN` thì gửi
 * `Authorization: Bearer`. KHÔNG có bản giả khi chạy: dịch vụ tắt/lỗi → ném `LLM_UNAVAILABLE` để nơi gọi suy giảm về cosine (có ghi nhận).
 * Văn bản gửi đi PHẢI đã che PII (nguyên tắc #6); lỗi không chứa nội dung hay token.
 */
export const ML_RERANK_MODEL = 'bge-reranker-v2-m3';
const MAX_DOCUMENTS_PER_CALL = 32;
const MAX_CHARS = 4000;
const DEFAULT_TIMEOUT_MS = 60_000;

const responseSchema = z.object({
  model: z.string(),
  scores: z.array(z.number().min(0).max(1)),
});

export interface Reranker {
  readonly model: string;
  /** Điểm 0..1 cho từng đoạn, ĐÚNG thứ tự đầu vào. */
  rerank(query: string, documents: readonly string[]): Promise<number[]>;
}

export type MlRerankerOptions = {
  /** Ví dụ `http://192.168.1.124:8001` (ML_URL). */
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function failure(message: string, cause?: unknown): AppError {
  return new AppError('LLM_UNAVAILABLE', message, {
    cause: cause instanceof Error ? new Error(cause.name) : undefined,
  });
}

export function createMlReranker(options: MlRerankerOptions): Reranker {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function scoreBatch(query: string, documents: string[]): Promise<number[]> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rerank`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
        body: JSON.stringify({ query, documents }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw failure('Không kết nối được dịch vụ rerank.', cause);
    }
    if (!response.ok) throw failure(`Dịch vụ rerank trả về lỗi HTTP ${response.status}.`);
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success || parsed.data.scores.length !== documents.length) {
      throw failure('Phản hồi của dịch vụ rerank không đúng định dạng.');
    }
    if (parsed.data.model !== ML_RERANK_MODEL) {
      throw failure(
        `Dịch vụ rerank trả model "${parsed.data.model}", khác "${ML_RERANK_MODEL}" — từ chối dùng.`,
      );
    }
    return parsed.data.scores;
  }

  return {
    model: ML_RERANK_MODEL,
    async rerank(query, documents) {
      if (documents.length === 0) return [];
      const q = (query === '' ? ' ' : query).slice(0, MAX_CHARS);
      const clipped = documents.map((doc) => (doc === '' ? ' ' : doc.slice(0, MAX_CHARS)));
      const scores: number[] = [];
      for (let i = 0; i < clipped.length; i += MAX_DOCUMENTS_PER_CALL) {
        scores.push(...(await scoreBatch(q, clipped.slice(i, i + MAX_DOCUMENTS_PER_CALL))));
      }
      return scores;
    },
  };
}

/** Chỉ dùng rerank khi `ML_RERANK_ENABLED=true` VÀ có `ML_URL` (cờ mặc định TẮT). Hàm thuần. */
export function loadMlRerankerOptions(
  env: Record<string, string | undefined>,
): MlRerankerOptions | undefined {
  const baseUrl = env.ML_URL?.trim();
  if (env.ML_RERANK_ENABLED !== 'true' || !baseUrl) return undefined;
  const token = env.ML_API_TOKEN?.trim();
  return { baseUrl, ...(token ? { token } : {}) };
}
