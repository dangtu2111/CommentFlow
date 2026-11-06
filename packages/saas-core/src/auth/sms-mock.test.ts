import { describe, expect, it, vi } from 'vitest';
import { createMockSmsProvider } from './sms-mock';

const message = {
  to: '+84912345678',
  text: 'CommentFlow: ma xac minh cua ban la 482913. Het han sau 5 phut.',
};

describe('createMockSmsProvider', () => {
  it('dev/test: ghi log với SĐT đã che (mã OTP nằm trong log dev để thử), không gửi gì ra ngoài', async () => {
    const lines: string[] = [];
    const sms = createMockSmsProvider({ appEnv: 'dev', log: (line) => lines.push(line) });
    await sms.send(message);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('+849 ••• ••• 678');
    expect(lines[0]).toContain('482913');
    expect(lines[0]).not.toContain('+84912345678');
    expect(lines[0]).not.toContain('912345678');
  });

  it('ghi hộp thư thử (JSON một dòng) khi có đường dẫn, SĐT đã che', async () => {
    const append = vi.fn(async () => undefined);
    const sms = createMockSmsProvider({ appEnv: 'test', log: () => undefined, outbox: { append } });
    await sms.send(message);
    expect(append).toHaveBeenCalledTimes(1);
    const line = (append.mock.calls[0] as unknown as [string])[0];
    expect(JSON.parse(line)).toMatchObject({ to: '+849 ••• ••• 678', code: '482913' });
    expect(line).not.toContain('912345678');
  });

  it.each(['staging', 'production'])(
    'từ chối chạy ở %s (không bao giờ ghi mã vào log thật)',
    async (env) => {
      const log = vi.fn();
      const sms = createMockSmsProvider({ appEnv: env, log });
      await expect(sms.send(message)).rejects.toThrow();
      expect(log).not.toHaveBeenCalled();
    },
  );
});
