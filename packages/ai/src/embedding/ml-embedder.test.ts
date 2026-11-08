import { isAppError } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import { EMBEDDING_DIMENSIONS } from './embedder';
import { createMlEmbedder, loadMlEmbedderOptions, ML_EMBEDDING_MODEL } from './ml-embedder';

const vector = () => new Array<number>(EMBEDDING_DIMENSIONS).fill(0.1);
const okBody = (count: number, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: 'bge-m3',
    dimensions: EMBEDDING_DIMENSIONS,
    vectors: Array.from({ length: count }, vector),
    ...over,
  });
const json = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } });

function setup(respond: (body: { texts: string[] }) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit; body: { texts: string[] } }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), init: init ?? {}, body });
    return respond(body);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : `KHÁC: ${String(error)}`;
  }
  return undefined;
};

describe('createMlEmbedder (bge-m3 qua dịch vụ ml)', () => {
  it('gọi POST {baseUrl}/embed, trả vector 1024 chiều, model bge-m3', async () => {
    const { fetchImpl, calls } = setup((b) => json(okBody(b.texts.length)));
    const embedder = createMlEmbedder({ baseUrl: 'http://ml.test:8001/', fetchImpl });
    const out = await embedder.embed(['ship bao lâu', 'đổi trả']);
    expect(embedder.model).toBe(ML_EMBEDDING_MODEL);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(1024);
    expect(calls[0]?.url).toBe('http://ml.test:8001/embed');
    expect(new Headers(calls[0]?.init.headers).has('authorization')).toBe(false);
  });

  it('có token → gửi Bearer', async () => {
    const { fetchImpl, calls } = setup((b) => json(okBody(b.texts.length)));
    await createMlEmbedder({ baseUrl: 'http://ml', token: 'tok-test', fetchImpl }).embed(['a']);
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('Bearer tok-test');
  });

  it('chia lô 64 câu/lần, giữ thứ tự; cắt câu quá 4000 ký tự; câu rỗng thành khoảng trắng', async () => {
    const { fetchImpl, calls } = setup((b) => json(okBody(b.texts.length)));
    const texts = Array.from({ length: 130 }, (_, i) =>
      i === 0 ? '' : 'x'.repeat(i === 1 ? 5000 : 3),
    );
    const out = await createMlEmbedder({ baseUrl: 'http://ml', fetchImpl }).embed(texts);
    expect(out).toHaveLength(130);
    expect(calls.map((c) => c.body.texts.length)).toEqual([64, 64, 2]);
    expect(calls[0]?.body.texts[0]).toBe(' ');
    expect(calls[0]?.body.texts[1]).toHaveLength(4000);
  });

  it('rỗng → không gọi mạng', async () => {
    const fetchImpl = vi.fn();
    expect(await createMlEmbedder({ baseUrl: 'http://ml', fetchImpl }).embed([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('lỗi mạng / HTTP lỗi / sai định dạng / sai chiều / sai số lượng → LLM_UNAVAILABLE, không lộ token', async () => {
    const net = setup(() => {
      throw new Error('ECONNREFUSED tok-secret');
    });
    const e1 = createMlEmbedder({
      baseUrl: 'http://ml',
      token: 'tok-secret',
      fetchImpl: net.fetchImpl,
    });
    expect(await codeOf(e1.embed(['a']))).toBe('LLM_UNAVAILABLE');
    const detail = await e1.embed(['a']).catch((e: Error) => `${e.message} ${e.cause}`);
    expect(String(detail)).not.toContain('tok-secret');

    const http = setup(() => json('{}', 503));
    expect(
      await codeOf(
        createMlEmbedder({ baseUrl: 'http://ml', fetchImpl: http.fetchImpl }).embed(['a']),
      ),
    ).toBe('LLM_UNAVAILABLE');
    const notJson = setup(() => new Response('không phải json', { status: 200 }));
    expect(
      await codeOf(
        createMlEmbedder({ baseUrl: 'http://ml', fetchImpl: notJson.fetchImpl }).embed(['a']),
      ),
    ).toBe('LLM_UNAVAILABLE');
    const wrongDim = setup(() => json(okBody(1, { dimensions: 8, vectors: [[0.1]] })));
    expect(
      await codeOf(
        createMlEmbedder({ baseUrl: 'http://ml', fetchImpl: wrongDim.fetchImpl }).embed(['a']),
      ),
    ).toBe('LLM_UNAVAILABLE');
    const wrongCount = setup(() => json(okBody(2)));
    expect(
      await codeOf(
        createMlEmbedder({ baseUrl: 'http://ml', fetchImpl: wrongCount.fetchImpl }).embed(['a']),
      ),
    ).toBe('LLM_UNAVAILABLE');
  });
});

describe('loadMlEmbedderOptions (cờ mặc định TẮT)', () => {
  it('chỉ bật khi ML_EMBED_ENABLED đúng "true" VÀ có ML_URL', () => {
    expect(loadMlEmbedderOptions({})).toBeUndefined();
    expect(loadMlEmbedderOptions({ ML_URL: 'http://ml' })).toBeUndefined();
    expect(loadMlEmbedderOptions({ ML_EMBED_ENABLED: 'true' })).toBeUndefined();
    expect(loadMlEmbedderOptions({ ML_EMBED_ENABLED: '1', ML_URL: 'http://ml' })).toBeUndefined();
    expect(loadMlEmbedderOptions({ ML_EMBED_ENABLED: 'true', ML_URL: ' http://ml ' })).toEqual({
      baseUrl: 'http://ml',
    });
  });

  it('token tùy chọn, bỏ khoảng trắng; rỗng thì không có', () => {
    expect(
      loadMlEmbedderOptions({ ML_EMBED_ENABLED: 'true', ML_URL: 'http://ml', ML_API_TOKEN: ' t ' }),
    ).toEqual({ baseUrl: 'http://ml', token: 't' });
    expect(
      loadMlEmbedderOptions({ ML_EMBED_ENABLED: 'true', ML_URL: 'http://ml', ML_API_TOKEN: ' ' }),
    ).toEqual({ baseUrl: 'http://ml' });
  });
});

describe('createMlEmbedder — xác nhận model dịch vụ trả về (FR-133)', () => {
  it('model của embedder = model được yêu cầu (đang hoạt động ở DB); dịch vụ trả đúng model → dùng được', async () => {
    const { fetchImpl } = setup((b) => json(okBody(b.texts.length, { model: 'bge-m3-v2' })));
    const embedder = createMlEmbedder({
      baseUrl: 'http://ml',
      fetchImpl,
      expectedModel: 'bge-m3-v2',
    });
    expect(embedder.model).toBe('bge-m3-v2');
    expect(await embedder.embed(['a'])).toHaveLength(1);
  });

  it('dịch vụ trả model KHÁC model đang hoạt động → từ chối dùng, báo lỗi rõ (không trả vector sai model)', async () => {
    const { fetchImpl } = setup((b) => json(okBody(b.texts.length, { model: 'bge-m3' })));
    const embedder = createMlEmbedder({
      baseUrl: 'http://ml',
      fetchImpl,
      expectedModel: 'model-khac',
    });
    const error = await embedder.embed(['a']).catch((e) => e);
    expect(isAppError(error)).toBe(true);
    expect(String(error.message)).toContain('model-khac');
    expect(String(error.message)).toContain('bge-m3');
  });

  it('không nêu expectedModel → mặc định bge-m3 (và vẫn kiểm phản hồi)', async () => {
    const { fetchImpl } = setup((b) => json(okBody(b.texts.length, { model: 'khac' })));
    const embedder = createMlEmbedder({ baseUrl: 'http://ml', fetchImpl });
    expect(embedder.model).toBe(ML_EMBEDDING_MODEL);
    await expect(embedder.embed(['a'])).rejects.toThrow();
  });
});
