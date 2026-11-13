import { Readable } from 'node:stream';
import { type MediaKind, SNIFF_BYTES, type SniffedMedia, sniffMedia } from '@flow/storage/rules';

/**
 * Hỗ trợ nhận file ảnh/video tải lên (COMPOSER-MEDIA, Q-PUB4). THUẦN theo luồng: không đọc cả file vào bộ nhớ; chỉ đệm vài byte đầu để NHẬN BIẾT LOẠI bằng nội dung
 * rồi chuyển tiếp phần còn lại, đếm số byte thực nhận và từ chối nếu khác độ dài khai báo.
 */
export const UPLOAD_MAX_BYTES = 200 * 1024 * 1024;

/** Độ dài khai báo hợp lệ (số nguyên dương ≤ trần); sai/thiếu → `null`. */
export function parseContentLength(value: string | null): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null;
  const length = Number(value);
  return length > 0 && length <= UPLOAD_MAX_BYTES ? length : null;
}

/** Cùng nguồn: chặn gửi chéo trang (CSRF) cho thao tác ghi bằng cookie phiên. Không có `Origin` → dựa vào `Sec-Fetch-Site`. */
export function isSameOrigin(headers: { get(name: string): string | null }): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin';
  const origin = headers.get('origin');
  const host = headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type UploadSniff =
  | { ok: true; media: SniffedMedia; stream: Readable }
  | { ok: false; reason: 'unsupported_type' | 'empty' };

export class UploadLengthError extends Error {
  constructor() {
    super('upload_length_mismatch');
    this.name = 'UploadLengthError';
  }
}

/**
 * Đọc vài byte đầu để nhận biết loại, rồi trả luồng gồm byte đã đệm + phần còn lại. Luồng ném `UploadLengthError` nếu số byte thực nhận khác `declaredLength`
 * (nhiều hơn → ném ngay khi vượt; ít hơn → ném khi kết thúc), để kho không lưu file cụt/thừa.
 */
export async function sniffAndStream(
  body: ReadableStream<Uint8Array>,
  declaredLength: number,
): Promise<UploadSniff> {
  const reader = body.getReader();
  const head: Uint8Array[] = [];
  let buffered = 0;
  let done = false;
  while (buffered < SNIFF_BYTES && !done) {
    const next = await reader.read();
    if (next.done) done = true;
    else {
      head.push(next.value);
      buffered += next.value.length;
    }
  }
  if (buffered === 0) {
    reader.releaseLock();
    return { ok: false, reason: 'empty' };
  }
  const first = Buffer.concat(head);
  const media = sniffMedia(first.subarray(0, SNIFF_BYTES));
  if (!media) {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: 'unsupported_type' };
  }
  async function* chunks(): AsyncGenerator<Buffer> {
    let total = first.length;
    if (total > declaredLength) throw new UploadLengthError();
    yield first;
    while (!done) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.length;
      if (total > declaredLength) throw new UploadLengthError();
      yield Buffer.from(next.value);
    }
    if (total !== declaredLength) throw new UploadLengthError();
  }
  return { ok: true, media, stream: Readable.from(chunks()) };
}

export type { MediaKind };
