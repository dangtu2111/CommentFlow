/**
 * Quy tắc ảnh/video của bài đăng (COMPOSER-MEDIA, Q-PUB4). THUẦN, không phụ thuộc mạng/DB. Loại file nhận biết bằng NỘI DUNG (chữ ký đầu file), KHÔNG tin đuôi file hay `Content-Type` do client gửi.
 * Giới hạn một bài: tối đa 10 ảnh (JPG/PNG/WebP, ≤ 8MB mỗi ảnh) HOẶC đúng 1 video (MP4/MOV, ≤ 200MB); không trộn ảnh với video.
 */
export type MediaKind = 'image' | 'video';

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGES_PER_POST = 10;
export const MAX_VIDEOS_PER_POST = 1;
/** Số byte đầu file cần đọc để nhận biết loại. */
export const SNIFF_BYTES = 16;

export type SniffedMedia = { kind: MediaKind; contentType: string };

const startsWith = (head: Uint8Array, bytes: readonly number[], offset = 0): boolean =>
  head.length >= offset + bytes.length && bytes.every((byte, i) => head[offset + i] === byte);

const ascii = (head: Uint8Array, start: number, end: number): string =>
  String.fromCharCode(...head.slice(start, end));

/** Nhận biết JPEG/PNG/WebP/MP4/MOV theo chữ ký đầu file; không nhận ra → `null`. */
export function sniffMedia(head: Uint8Array): SniffedMedia | null {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { kind: 'image', contentType: 'image/jpeg' };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: 'image', contentType: 'image/png' };
  }
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') {
    return { kind: 'image', contentType: 'image/webp' };
  }
  if (ascii(head, 4, 8) === 'ftyp') {
    const brand = ascii(head, 8, 12);
    return { kind: 'video', contentType: brand === 'qt  ' ? 'video/quicktime' : 'video/mp4' };
  }
  return null;
}

export const maxBytesFor = (kind: MediaKind): number =>
  kind === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;

export type MediaSetError = 'too_many_images' | 'too_many_videos' | 'mixed';

/** Kiểm tập file của MỘT bài: tối đa 10 ảnh hoặc 1 video, không trộn. Hợp lệ (kể cả rỗng) → `null`. */
export function checkMediaSet(kinds: readonly MediaKind[]): MediaSetError | null {
  const images = kinds.filter((kind) => kind === 'image').length;
  const videos = kinds.length - images;
  if (images > 0 && videos > 0) return 'mixed';
  if (images > MAX_IMAGES_PER_POST) return 'too_many_images';
  if (videos > MAX_VIDEOS_PER_POST) return 'too_many_videos';
  return null;
}
