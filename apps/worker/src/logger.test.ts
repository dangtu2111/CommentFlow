import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { logger: createLogger({ level: 'info' }, stream), lines };
}

describe('createLogger', () => {
  it('che token, mật khẩu, email, số điện thoại ở mọi trường đã biết', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        token: 'tok-123',
        password: 'pw-123',
        email: 'khach@example.com',
        phone: '0901234567',
        user: { accessToken: 'at-456', email: 'a@b.com' },
        headers: { authorization: 'Bearer secret-789' },
      },
      'sự kiện thử',
    );
    const output = lines.join('');
    for (const secret of [
      'tok-123',
      'pw-123',
      'khach@example.com',
      '0901234567',
      'at-456',
      'a@b.com',
      'secret-789',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('sự kiện thử');
  });

  it('che thêm cookie, apiKey, idToken, chuỗi kết nối và header cookie lồng nhau', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        cookie: 'session_token=tuyet-mat-1',
        apiKey: 'sk-tuyet-mat-2',
        idToken: 'idtoken-tuyet-mat-3',
        connectionString: 'postgresql://u:tuyet-mat-4@h/db',
        databaseUrl: 'postgresql://u:tuyet-mat-5@h/db',
        req: { headers: { cookie: 'a=tuyet-mat-6', authorization: 'Bearer tuyet-mat-7' } },
        res: { headers: { 'set-cookie': 'b=tuyet-mat-8' } },
        nested: { apiKey: 'sk-tuyet-mat-9' },
      },
      'sự kiện',
    );
    const output = lines.join('');
    for (let i = 1; i <= 9; i++) expect(output).not.toContain(`tuyet-mat-${i}`);
  });

  it('giữ nguyên các trường không nhạy cảm', () => {
    const { logger, lines } = captureLogger();
    logger.info({ jobId: 'abc-1' }, 'ok');
    expect(lines.join('')).toContain('abc-1');
  });
});
