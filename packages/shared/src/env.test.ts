import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseEnv } from './env';
import { isAppError } from './errors';

const schema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3001),
});

describe('parseEnv', () => {
  it('trả về cấu hình đã kiểm tra kiểu và áp giá trị mặc định', () => {
    const env = parseEnv(schema, { DATABASE_URL: 'postgres://u:p@localhost:5433/cf_dev' });
    expect(env.PORT).toBe(3001);
    expect(env.DATABASE_URL).toContain('cf_dev');
  });

  it('báo CONFIG_INVALID kèm tên biến sai', () => {
    try {
      parseEnv(schema, { PORT: '-5' });
      expect.unreachable();
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (!isAppError(error)) return;
      expect(error.code).toBe('CONFIG_INVALID');
      expect(error.message).toContain('DATABASE_URL');
      expect(error.message).toContain('PORT');
    }
  });

  it('không bao giờ đưa giá trị biến vào thông báo lỗi (có thể là bí mật)', () => {
    try {
      parseEnv(schema, { DATABASE_URL: 'not-a-url-super-secret-123' });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain('super-secret-123');
    }
  });
});
