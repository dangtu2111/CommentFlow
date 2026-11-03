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

  it('che tên dạng snake_case, Authorization viết hoa và header lồng sâu trong lỗi HTTP (err.config.headers)', () => {
    const { logger, lines } = captureLogger();
    logger.error(
      {
        access_token: 'tm-1',
        refresh_token: 'tm-2',
        api_key: 'tm-3',
        client_secret: 'tm-4',
        Authorization: 'Bearer tm-5',
        headers: { Authorization: 'Bearer tm-6' },
        err: {
          message: 'Request failed',
          config: {
            headers: { Authorization: 'Bearer tm-7', 'x-api-key': 'tm-8', cookie: 'a=tm-9' },
            data: '{"access_token":"tm-10"}',
          },
          request: { headers: { Authorization: 'Bearer tm-11' } },
        },
      },
      'lỗi gọi API',
    );
    const output = lines.join('');
    for (let i = 1; i <= 11; i++) expect(output).not.toContain(`tm-${i}`);
    expect(output).toContain('Request failed'); // thông tin chẩn đoán còn giữ
  });

  it('che đường lỗi HTTP lồng sâu: err.response.config.headers, err.response.data.access_token, err.config.params/url, err.request._header', () => {
    const { logger, lines } = captureLogger();
    logger.error(
      {
        err: {
          message: 'Request failed with status 400',
          config: {
            url: 'https://graph.example/me?access_token=sq-1',
            params: { access_token: 'sq-2' },
          },
          response: {
            status: 400,
            config: { headers: { Authorization: 'Bearer sq-3' }, data: 'client_secret=sq-4' },
            data: { access_token: 'sq-5', refresh_token: 'sq-6' },
          },
          request: {
            _header: 'GET /me HTTP/1.1\r\nAuthorization: Bearer sq-7\r\n',
            path: '/me?access_token=sq-8',
          },
        },
      },
      'lỗi Graph API',
    );
    const output = lines.join('');
    for (let i = 1; i <= 8; i++) expect(output).not.toContain(`sq-${i}`);
    expect(output).toContain('Request failed with status 400'); // còn thông tin chẩn đoán
  });

  it('giữ nguyên các trường không nhạy cảm', () => {
    const { logger, lines } = captureLogger();
    logger.info({ jobId: 'abc-1' }, 'ok');
    expect(lines.join('')).toContain('abc-1');
  });
});
