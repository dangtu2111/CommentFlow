/**
 * Chèn emoji / liên kết / hashtag vào nội dung bài (Biên tập bài viết). THUẦN, không phụ thuộc React/trình duyệt. Vị trí theo đơn vị UTF-16 như `selectionStart` của textarea.
 */
export function insertAtCursor(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string,
): { text: string; cursor: number } {
  const clamp = (value: number) => Math.min(text.length, Math.max(0, Math.floor(value)));
  const a = clamp(selectionStart);
  const b = clamp(selectionEnd);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return {
    text: `${text.slice(0, start)}${insert}${text.slice(end)}`,
    cursor: start + insert.length,
  };
}

const TAG_KEY = (tag: string) => tag.toLowerCase();

/** Thêm hashtag vào CUỐI nội dung (dòng riêng), bỏ thẻ đã có trong nội dung (không phân biệt hoa/thường). Không có thẻ mới → giữ nguyên. */
export function appendHashtags(text: string, hashtags: readonly string[]): string {
  const existing = new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(TAG_KEY));
  const fresh: string[] = [];
  for (const tag of hashtags) {
    if (!existing.has(TAG_KEY(tag)) && !fresh.some((t) => TAG_KEY(t) === TAG_KEY(tag)))
      fresh.push(tag);
  }
  if (fresh.length === 0) return text;
  const line = fresh.join(' ');
  return text.trim() === '' ? line : `${text.replace(/\s+$/, '')}\n\n${line}`;
}

/** Liên kết người dùng nhập: chỉ `https` hợp lệ (chuẩn hóa); còn lại → `null`. */
export function parseHttpsLink(input: string): string | null {
  const value = input.trim();
  if (value === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}
