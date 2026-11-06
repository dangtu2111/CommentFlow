/**
 * Tách văn bản sạch từ HTML (không chạy JavaScript, không thêm thư viện): bỏ script/style/menu/chân trang/biểu mẫu/
 * phần tử ẩn (kẻ xấu hay giấu lệnh cho AI trong phần tử ẩn), ưu tiên `<main>`/`<article>`, giải mã thực thể, mỗi khối một dòng.
 * Một lượt quét tuyến tính, không RegExp lồng nhau nên không bị ReDoS.
 */

export interface ExtractedText {
  title: string | undefined;
  text: string;
  /** Văn bản đã bị cắt theo `maxChars`. */
  truncated: boolean;
}

export interface ExtractOptions {
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 200_000;
/** `<main>`/`<article>` ngắn hơn mức này coi là khung trang, không phải nội dung chính. */
const MIN_FOCUS_CHARS = 80;

const SKIP_ELEMENTS = new Set([
  'head',
  'nav',
  'footer',
  'header',
  'aside',
  'form',
  'select',
  'button',
  'dialog',
  'iframe',
  'object',
  'embed',
  'canvas',
  'svg',
  'noscript',
  'template',
  'audio',
  'video',
]);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea']);
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const BLOCK_ELEMENTS = new Set([
  'p',
  'div',
  'section',
  'article',
  'main',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'table',
  'tr',
  'blockquote',
  'pre',
  'hr',
  'dl',
  'dt',
  'dd',
  'figure',
  'figcaption',
  'details',
  'summary',
  'address',
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number(body.slice(1));
      const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

// Ký tự xuống dòng (cả kiểu Unicode) → ngắt dòng.
const LINE_BREAK_CODES = new Set([0x0a, 0x0d, 0x0b, 0x0c, 0x85, 0x2028, 0x2029]);

/** Điều khiển C0/C1, ký tự rộng-0, đảo chiều văn bản, BOM: vô hình với người đọc nhưng AI vẫn thấy. */
function isInvisible(code: number): boolean {
  return (
    code <= 0x08 ||
    (code >= 0x0e && code <= 0x1f) ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2064) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/** Chuẩn hóa văn bản đã tách: bỏ ký tự vô hình, gộp khoảng trắng, mỗi dòng một khối, bỏ dòng trống. Lũy đẳng. */
export function normalizeExtractedText(text: string): string {
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (trimmed !== '') lines.push(trimmed);
    line = '';
  };
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (LINE_BREAK_CODES.has(code)) flush();
    else if (!isInvisible(code)) line += text[i];
  }
  flush();
  return lines.join('\n');
}

function isHiddenByAttributes(attributes: string): boolean {
  return (
    /(?:^|\s)hidden(?:\s|=|$)/.test(attributes) ||
    /aria-hidden\s*=\s*["']?true/.test(attributes) ||
    /display\s*:\s*none/.test(attributes) ||
    /visibility\s*:\s*hidden/.test(attributes)
  );
}

/** Vị trí dấu `>` đóng thẻ (bỏ qua `>` trong giá trị có ngoặc kép/đơn); không có → -1. */
function findTagEnd(html: string, from: number): number {
  let quote = '';
  for (let i = from; i < html.length; i += 1) {
    const char = html[i]!;
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '>') return i;
  }
  return -1;
}

function walk(html: string, focus: string | undefined): { title: string | undefined; raw: string } {
  const lower = html.toLowerCase();
  let out = '';
  let title: string | undefined;
  let skipName: string | undefined;
  let skipDepth = 0;
  let focusDepth = focus ? 0 : 1;
  let i = 0;
  const emit = (chunk: string) => {
    if (!skipName && focusDepth > 0) out += chunk;
  };
  /** Nhảy qua nội dung thô tới sau thẻ đóng `</name>`; trả nội dung giữa hai thẻ. */
  const consumeRaw = (name: string, contentStart: number): string => {
    const close = lower.indexOf(`</${name}`, contentStart);
    if (close < 0) {
      i = html.length;
      return html.slice(contentStart);
    }
    const end = html.indexOf('>', close);
    i = end < 0 ? html.length : end + 1;
    return html.slice(contentStart, close);
  };

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      emit(decodeEntities(html.slice(i)));
      break;
    }
    if (lt > i) emit(decodeEntities(html.slice(i, lt)));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const next = html[lt + 1];
    if (next === '!' || next === '?') {
      const end = html.indexOf('>', lt);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const closing = next === '/';
    const nameStart = lt + (closing ? 2 : 1);
    const name = /^[a-z][a-z0-9-]*/.exec(lower.slice(nameStart, nameStart + 32))?.[0];
    if (!name) {
      emit('<');
      i = lt + 1;
      continue;
    }
    const end = findTagEnd(html, nameStart + name.length);
    if (end < 0) break; // thẻ cụt ở cuối: bỏ phần còn lại
    i = end + 1;

    if (closing) {
      if (skipName) {
        if (name === skipName && --skipDepth === 0) skipName = undefined;
        continue;
      }
      if (name === focus) focusDepth = Math.max(0, focusDepth - 1);
      if (BLOCK_ELEMENTS.has(name)) emit('\n');
      continue;
    }

    const attributes = lower.slice(nameStart + name.length, end);
    const selfClosing = html[end - 1] === '/' || VOID_ELEMENTS.has(name);
    if (name === 'title') {
      const content = consumeRaw('title', i);
      if (title === undefined && (!skipName || skipName === 'head'))
        title = normalizeExtractedText(decodeEntities(content));
      continue;
    }
    if (RAW_TEXT_ELEMENTS.has(name) && !selfClosing) {
      consumeRaw(name, i);
      continue;
    }
    if (skipName) {
      if (name === skipName && !selfClosing) skipDepth += 1;
      continue;
    }
    if (SKIP_ELEMENTS.has(name) || isHiddenByAttributes(attributes)) {
      if (!selfClosing) {
        skipName = name;
        skipDepth = 1;
      }
      continue;
    }
    if (name === focus) focusDepth += 1;
    if (name === 'br') emit('\n');
    else if (name === 'li') emit('\n- ');
    else if (name === 'td' || name === 'th') emit(' | ');
    else if (BLOCK_ELEMENTS.has(name)) emit('\n');
  }
  return { title, raw: out };
}

export function extractCleanText(html: string, options: ExtractOptions = {}): ExtractedText {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const whole = walk(html, undefined);
  let text = normalizeExtractedText(whole.raw);
  for (const focus of ['main', 'article']) {
    const focused = normalizeExtractedText(walk(html, focus).raw);
    if (focused.length >= MIN_FOCUS_CHARS) {
      text = focused;
      break;
    }
  }
  const truncated = text.length > maxChars;
  return {
    title: whole.title || undefined,
    text: truncated ? text.slice(0, maxChars).trimEnd() : text,
    truncated,
  };
}
