import { randomBytes } from 'node:crypto';

const MAX_SLUG_LENGTH = 40;

/** Chuyển tên (có dấu tiếng Việt) thành slug an toàn cho URL. */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'workspace';
}

/** Slug có hậu tố ngẫu nhiên 6 ký tự hex để không trùng giữa các workspace cùng tên. */
export function uniqueSlug(name: string, suffix: string = randomBytes(3).toString('hex')): string {
  return `${slugify(name)}-${suffix}`;
}
