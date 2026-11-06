import { z } from 'zod';
import { parseEnv } from './env';

/**
 * Thương hiệu cấu hình được (FR-125). Tên sản phẩm/tên miền chưa chốt (Q6) nên chỉ có GIÁ TRỊ TẠM; không nơi nào
 * khác được viết cứng tên sản phẩm — đọc từ đây.
 */
export const DEFAULT_BRAND = { name: 'CommentFlow AI' } as const;

export type BrandConfig = {
  /** Tên hiển thị (giao diện, tiêu đề trang, thư, issuer 2FA). */
  name: string;
  /** Logo: đường dẫn gốc (`/brand/logo.svg`) hoặc URL http(s). Chưa đặt → dùng biểu tượng mặc định. */
  logoUrl: string | undefined;
  /** Tên miền công khai (chữ thường, không scheme/đường dẫn). */
  domain: string | undefined;
  /** Địa chỉ gửi thư đầy đủ (`Tên <no-reply@domain>`). */
  mailFrom: string | undefined;
};

/** Giá trị rỗng/chỉ khoảng trắng coi như chưa đặt (file `.env` hay để trống). */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

function hasControlChar(value: string): boolean {
  return [...value].some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}

const HOSTNAME =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

const brandEnvSchema = z.object({
  APP_NAME: optional(
    z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine((value) => !hasControlChar(value)),
  ),
  APP_LOGO_URL: optional(
    z
      .string()
      .trim()
      .max(2048)
      .refine(
        (value) =>
          (value.startsWith('/') && !value.startsWith('//')) || /^https?:\/\//i.test(value),
      ),
  ),
  APP_DOMAIN: optional(
    z
      .string()
      .trim()
      .toLowerCase()
      .refine((value) => HOSTNAME.test(value)),
  ),
  APP_EMAIL_FROM: optional(
    z
      .string()
      .trim()
      .min(3)
      .max(254)
      .refine((value) => !hasControlChar(value)),
  ),
});

/** Đọc cấu hình thương hiệu từ biến môi trường (`APP_NAME`, `APP_LOGO_URL`, `APP_DOMAIN`, `APP_EMAIL_FROM`). */
export function loadBrandConfig(
  source: Record<string, string | undefined> = process.env,
): BrandConfig {
  const env = parseEnv(brandEnvSchema, {
    APP_NAME: source.APP_NAME,
    APP_LOGO_URL: source.APP_LOGO_URL,
    APP_DOMAIN: source.APP_DOMAIN,
    APP_EMAIL_FROM: source.APP_EMAIL_FROM,
  });
  return {
    name: env.APP_NAME ?? DEFAULT_BRAND.name,
    logoUrl: env.APP_LOGO_URL,
    domain: env.APP_DOMAIN,
    mailFrom: env.APP_EMAIL_FROM,
  };
}

/** Địa chỉ gửi thư mặc định: `APP_EMAIL_FROM`, hoặc `Tên <no-reply@domain>`; không đủ dữ liệu → undefined. */
export function defaultMailFrom(brand: BrandConfig): string | undefined {
  if (brand.mailFrom) return brand.mailFrom;
  return brand.domain ? `${brand.name} <no-reply@${brand.domain}>` : undefined;
}
