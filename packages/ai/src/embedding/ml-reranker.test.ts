import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { createMlReranker, loadMlRerankerOptions, ML_RERANK_MODEL } from './ml-reranker';

type Call = { url: string; body: unknown; auth: string | null };

function fakeFetch(reply: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      body: JSON.parse(String(init.body)),
      auth: new Headers(init.headers).get('authorization'),
    };
    calls.push(call);
    return reply(call);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('createMlReranker', () => {
  it('POST /rerank với câu hỏi + đoạn, trả điểm theo đúng thứ tự đầu vào', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ model: ML_RERANK_MODEL, scores: [0.9, 0.1, 0.5] }),
    );
    const reranker = createMlReranker({ baseUrl: 'http://ml.test:8000/', token: 's', fetchImpl });
    const scores = await reranker.rerank('ship COD không', ['a', 'b', 'c']);
    expect(scores).toEqual([0.9, 0.1, 0.5]);
    expect(reranker.model).toBe(ML_RERANK_MODEL);
    expect(calls[0]).toEqual({
      url: 'http://ml.test:8000/rerank',
      body: { query: 'ship COD không', documents: ['a', 'b', 'c'] },
      auth: 'Bearer s',
    });
  });

  it('không có tài liệu → trả mảng rỗng, KHÔNG gọi dịch vụ', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({}));
    expect(await createMlReranker({ baseUrl: 'http://x', fetchImpl }).rerank('q', [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('tài liệu quá nhiều → chia lô ≤ 32 và nối điểm theo thứ tự; cắt văn bản dài', async () => {
    const { fetchImpl, calls } = fakeFetch((call) => {
      const docs = (call.body as { documents: string[] }).documents;
      return json({ model: ML_RERANK_MODEL, scores: docs.map((_, i) => i / 100) });
    });
    const reranker = createMlReranker({ baseUrl: 'http://x', fetchImpl });
    const docs = Array.from({ length: 40 }, (_, i) => (i === 0 ? 'z'.repeat(5000) : `d${i}`));
    const scores = await reranker.rerank('q', docs);
    expect(scores).toHaveLength(40);
    expect(calls).toHaveLength(2);
    const firstBatch = (calls[0] as Call).body as { documents: string[] };
    expect(firstBatch.documents).toHaveLength(32);
    expect(firstBatch.documents[0]).toHaveLength(4000);
  });

  it('câu hỏi/đoạn rỗng được thay bằng một khoảng trắng (dịch vụ không nhận chuỗi rỗng)', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ model: ML_RERANK_MODEL, scores: [0.5] }));
    await createMlReranker({ baseUrl: 'http://x', fetchImpl }).rerank('', ['']);
    expect(calls[0]?.body).toEqual({ query: ' ', documents: [' '] });
  });

  it('lỗi mạng không phải Error (chuỗi) vẫn thành LLM_UNAVAILABLE, không lộ nguyên nhân', async () => {
    const fetchImpl = (async () => {
      throw 'down';
    }) as unknown as typeof fetch;
    const error = await createMlReranker({ baseUrl: 'http://x', fetchImpl })
      .rerank('q', ['a'])
      .catch((e) => e);
    expect(isAppError(error) && error.code === 'LLM_UNAVAILABLE').toBe(true);
  });

  it.each([
    ['HTTP lỗi', () => json({}, 503)],
    ['sai định dạng', () => json({ model: ML_RERANK_MODEL, scores: 'x' })],
    ['thân không phải JSON', () => new Response('khong phai json', { status: 200 })],
    ['lệch số điểm', () => json({ model: ML_RERANK_MODEL, scores: [0.1] })],
    ['model lạ', () => json({ model: 'khac', scores: [0.1, 0.2] })],
    ['điểm ngoài 0..1', () => json({ model: ML_RERANK_MODEL, scores: [0.1, 1.5] })],
  ])('%s → LLM_UNAVAILABLE rõ ràng, không lộ nội dung/token', async (_name, reply) => {
    const { fetchImpl } = fakeFetch(reply);
    const reranker = createMlReranker({ baseUrl: 'http://x', token: 'bimat', fetchImpl });
    const error = await reranker.rerank('cau hoi rieng tu', ['a', 'b']).catch((e) => e);
    expect(isAppError(error) && error.code === 'LLM_UNAVAILABLE').toBe(true);
    expect(String(error.message)).not.toMatch(/bimat|cau hoi rieng tu/);
  });

  it('lỗi mạng → LLM_UNAVAILABLE', async () => {
    const fetchImpl = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const error = await createMlReranker({ baseUrl: 'http://x', fetchImpl })
      .rerank('q', ['a'])
      .catch((e) => e);
    expect(isAppError(error) && error.code === 'LLM_UNAVAILABLE').toBe(true);
  });
});

describe('loadMlRerankerOptions — chỉ bật khi ML_RERANK_ENABLED=true và có ML_URL', () => {
  it('tắt mặc định; thiếu URL → tắt; bật đủ → có tùy chọn (kèm token nếu có)', () => {
    expect(loadMlRerankerOptions({})).toBeUndefined();
    expect(loadMlRerankerOptions({ ML_RERANK_ENABLED: 'true' })).toBeUndefined();
    expect(loadMlRerankerOptions({ ML_URL: 'http://x', ML_RERANK_ENABLED: 'yes' })).toBeUndefined();
    expect(loadMlRerankerOptions({ ML_URL: 'http://x', ML_RERANK_ENABLED: 'true' })).toEqual({
      baseUrl: 'http://x',
    });
    expect(
      loadMlRerankerOptions({ ML_URL: 'http://x', ML_RERANK_ENABLED: 'true', ML_API_TOKEN: ' t ' }),
    ).toEqual({ baseUrl: 'http://x', token: 't' });
  });
});
