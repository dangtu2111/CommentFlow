export type PostsPageToken = number | 'gap';

/**
 * Dãy số trang hiển thị (1 … 5 6 7 … 12): luôn có trang đầu/cuối và một trang kề hai bên trang hiện tại; khoảng bị
 * lược là `'gap'`. Trang ngoài khoảng được kẹp lại; không có trang → `[1]`.
 */
export function postsPageWindow(page: number, pageCount: number): PostsPageToken[] {
  const last = Math.max(1, Math.floor(pageCount));
  const current = Math.min(Math.max(1, Math.floor(page)), last);
  const wanted = new Set<number>([1, last, current - 1, current, current + 1]);
  if (current <= 2) wanted.add(3);
  if (current >= last - 1) wanted.add(last - 2);
  const pages = [...wanted].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const tokens: PostsPageToken[] = [];
  for (const n of pages) {
    const prev = tokens[tokens.length - 1];
    if (typeof prev === 'number' && n - prev > 1) tokens.push('gap');
    tokens.push(n);
  }
  return tokens;
}
