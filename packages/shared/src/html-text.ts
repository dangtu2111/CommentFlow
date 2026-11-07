/**
 * Chuyển HTML (ví dụ nội dung chính sách cửa hàng Shopify) thành văn bản thuần để lưu vào kiến thức. Thuần, không thư viện:
 * bỏ script/style, đổi thẻ khối thành xuống dòng (`<li>` thành "- "), bỏ mọi thẻ còn lại, giải mã thực thể thông dụng MỘT lần,
 * gộp khoảng trắng. Kết quả chỉ là văn bản — React tự thoát ký tự khi hiển thị, không bao giờ dùng như HTML.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1]?.toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function htmlToPlainText(html: string, maxChars = 8000): string {
  const withBreaks = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|ul|ol|table|section|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  const text = decodeEntities(withBreaks)
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
  return text.slice(0, maxChars);
}
