import { describe, expect, it } from 'vitest';
import {
  isSameOrigin,
  parseContentLength,
  sniffAndStream,
  UploadLengthError,
} from './media-upload';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const streamOf = (...parts: number[][]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(Uint8Array.from(part));
      controller.close();
    },
  });
const drain = async (stream: AsyncIterable<unknown>) => {
  const out: Buffer[] = [];
  for await (const chunk of stream) out.push(chunk as Buffer);
  return Buffer.concat(out);
};
const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe('parseContentLength', () => {
  it('chỉ nhận số nguyên dương ≤ 200MB', () => {
    expect(parseContentLength('1234')).toBe(1234);
    for (const bad of [null, '', '0', '-5', 'abc', '1e3', '209715201', '99999999999999']) {
      expect(parseContentLength(bad), String(bad)).toBeNull();
    }
    expect(parseContentLength('209715200')).toBe(209715200);
  });
});

describe('isSameOrigin', () => {
  it('Sec-Fetch-Site same-origin hoặc Origin trùng Host; còn lại bị chặn', () => {
    expect(isSameOrigin(headers({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(isSameOrigin(headers({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isSameOrigin(headers({ origin: 'http://localhost:3000', host: 'localhost:3000' }))).toBe(
      true,
    );
    expect(isSameOrigin(headers({ origin: 'https://evil.com', host: 'localhost:3000' }))).toBe(
      false,
    );
    expect(isSameOrigin(headers({ host: 'localhost:3000' }))).toBe(false);
    expect(isSameOrigin(headers({ origin: 'not a url', host: 'x' }))).toBe(false);
  });
});

describe('sniffAndStream', () => {
  it('nhận biết loại bằng nội dung và chuyển tiếp ĐỦ byte (kể cả khi byte đầu chia nhiều khúc)', async () => {
    const all = [...PNG, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r = await sniffAndStream(
      streamOf(all.slice(0, 3), all.slice(3, 10), all.slice(10)),
      all.length,
    );
    if (!r.ok) throw new Error('phải nhận ra PNG');
    expect(r.media).toEqual({ kind: 'image', contentType: 'image/png' });
    expect([...(await drain(r.stream))]).toEqual(all);
  });

  it('nội dung lạ (HTML đổi đuôi .jpg) → unsupported_type; rỗng → empty', async () => {
    const html = [...'<html><script>alert(1)</script>'].map((c) => c.charCodeAt(0));
    expect(await sniffAndStream(streamOf(html), html.length)).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
    expect(await sniffAndStream(streamOf(), 10)).toEqual({ ok: false, reason: 'empty' });
  });

  it('thực nhận nhiều hơn hoặc ít hơn độ dài khai báo → UploadLengthError', async () => {
    const all = [...PNG, 1, 2, 3, 4, 5, 6, 7, 8];
    const more = await sniffAndStream(streamOf(all), all.length - 2);
    if (!more.ok) throw new Error('png');
    await expect(drain(more.stream)).rejects.toBeInstanceOf(UploadLengthError);
    const less = await sniffAndStream(streamOf(all), all.length + 5);
    if (!less.ok) throw new Error('png');
    await expect(drain(less.stream)).rejects.toBeInstanceOf(UploadLengthError);
  });
});
