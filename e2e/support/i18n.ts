import { readFileSync } from 'node:fs';

/**
 * Chuỗi giao diện cho E2E lấy thẳng từ `vi.json`/`en.json` của packages/shared (không chép chuỗi cứng).
 * Đọc bằng đường dẫn tương đối để e2e không phụ thuộc gói nội bộ nào.
 */
export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Tên cookie ngôn ngữ của web (packages/shared `LOCALE_COOKIE`). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

type Tree = { [key: string]: string | Tree };
type Params = Record<string, string | number>;

const cache = new Map<Locale, Tree>();

function load(locale: Locale): Tree {
  let tree = cache.get(locale);
  if (!tree) {
    const file = new URL(`../../packages/shared/src/i18n/messages/${locale}.json`, import.meta.url);
    tree = JSON.parse(readFileSync(file, 'utf8')) as Tree;
    cache.set(locale, tree);
  }
  return tree;
}

/** Thay `{tên}` bằng giá trị; thiếu tham số thì báo lỗi (tránh khẳng định với chuỗi còn dấu ngoặc). */
export function interpolate(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Thiếu tham số "${name}" cho chuỗi: ${template}`);
    return String(value);
  });
}

/** Lấy chuỗi theo khóa dạng `auth.register.submit`. Chỉ hỗ trợ chuỗi có tham số đơn giản (không ICU plural). */
export function message(locale: Locale, key: string, params?: Params): string {
  let node: string | Tree | undefined = load(locale);
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  if (typeof node !== 'string') throw new Error(`Không có chuỗi "${key}" trong ${locale}.json`);
  return interpolate(node, params);
}

/** Hàm dịch gắn sẵn ngôn ngữ cho một ca test. */
export function translator(locale: Locale) {
  return (key: string, params?: Params) => message(locale, key, params);
}
export type Translate = ReturnType<typeof translator>;
