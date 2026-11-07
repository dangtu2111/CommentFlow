import { AppError } from '@flow/shared';
import { z } from 'zod';
import { EMBEDDING_DIMENSIONS, type Embedder } from './embedder';

/**
 * Embedder THẬT qua dịch vụ `ml` (bge-m3, 1024 chiều — docs/09 §2): miễn phí, chạy trong mạng nội bộ, KHÔNG dùng
 * embedding trả phí. Gọi `POST {ML_URL}/embed`; nếu `ML_API_TOKEN` được đặt thì gửi `Authorization: Bearer`. Văn bản
 * gửi đi PHẢI đã che PII (nguyên tắc #6) — nơi gọi chịu trách nhiệm; lỗi không chứa nội dung hay token.
 */
export const ML_EMBEDDING_MODEL = 'bge-m3';
const MAX_TEXTS_PER_CALL = 64;
const MAX_CHARS_PER_TEXT = 4000;
const DEFAULT_TIMEOUT_MS = 60_000;

const responseSchema = z.object({
  model: z.string(),
  dimensions: z.literal(EMBEDDING_DIMENSIONS),
  vectors: z.array(z.array(z.number()).length(EMBEDDING_DIMENSIONS)),
});

export type MlEmbedderOptions = {
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

export function createMlEmbedder(options: MlEmbedderOptions): Embedder {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function embedBatch(texts: string[]): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/embed`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
        body: JSON.stringify({ texts }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw failure('Không kết nối được dịch vụ embedding.', cause);
    }
    if (!response.ok) {
      throw failure(`Dịch vụ embedding trả về lỗi HTTP ${response.status}.`);
    }
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success || parsed.data.vectors.length !== texts.length) {
      throw failure('Phản hồi của dịch vụ embedding không đúng định dạng.');
    }
    return parsed.data.vectors;
  }

  return {
    model: ML_EMBEDDING_MODEL,
    async embed(texts) {
      const clipped = texts.map((text) => (text === '' ? ' ' : text.slice(0, MAX_CHARS_PER_TEXT)));
      const vectors: number[][] = [];
      for (let i = 0; i < clipped.length; i += MAX_TEXTS_PER_CALL) {
        vectors.push(...(await embedBatch(clipped.slice(i, i + MAX_TEXTS_PER_CALL))));
      }
      return vectors;
    },
  };
}

/**
 * Chọn embedder theo cấu hình: chỉ dùng `ml` khi `ML_EMBED_ENABLED=true` VÀ có `ML_URL` (cờ mặc định TẮT);
 * ngược lại `undefined` để nơi gọi giữ bản mock/fixture. Hàm thuần.
 */
export function loadMlEmbedderOptions(
  env: Record<string, string | undefined>,
): MlEmbedderOptions | undefined {
  const baseUrl = env.ML_URL?.trim();
  if (env.ML_EMBED_ENABLED !== 'true' || !baseUrl) return undefined;
  const token = env.ML_API_TOKEN?.trim();
  return { baseUrl, ...(token ? { token } : {}) };
}
