import type { z } from 'zod';
import { AppError } from './errors';

/**
 * Đọc và kiểm tra biến môi trường bằng Zod. Thông báo lỗi chỉ nêu TÊN biến sai,
 * không bao giờ nêu giá trị (có thể là bí mật — nguyên tắc bất biến #6).
 */
export function parseEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, string | undefined> = process.env,
): z.output<Schema> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const names = [
    ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '(không rõ tên)'))),
  ];
  throw new AppError('CONFIG_INVALID', `Cấu hình môi trường không hợp lệ: ${names.join(', ')}`);
}
