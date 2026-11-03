import { describe, expect, it } from 'vitest';
import {
  interpretPostgresReply,
  interpretSmtpBanner,
  interpretValkeyReply,
  passwordFromRedisUrl,
} from './stack-check.mjs';

describe('interpretPostgresReply', () => {
  it('nhận S và N, loại byte khác', () => {
    expect(interpretPostgresReply(0x53)).toBe(true);
    expect(interpretPostgresReply(0x4e)).toBe(true);
    expect(interpretPostgresReply(0x48)).toBe(false);
    expect(interpretPostgresReply(undefined)).toBe(false);
  });
});

describe('interpretValkeyReply', () => {
  it('PONG và NOAUTH đều là Valkey đang chạy', () => {
    expect(interpretValkeyReply('+PONG\r\n').ok).toBe(true);
    expect(interpretValkeyReply('-NOAUTH Authentication required.\r\n').ok).toBe(true);
  });
  it('phản hồi khác là lỗi', () => {
    expect(interpretValkeyReply('-ERR invalid password\r\n').ok).toBe(false);
    expect(interpretValkeyReply('HTTP/1.1 400').ok).toBe(false);
  });
});

describe('passwordFromRedisUrl', () => {
  it('lấy mật khẩu có ký tự mã hóa', () => {
    expect(passwordFromRedisUrl('redis://:p%40ss@host:6380/0')).toBe('p@ss');
  });
  it('không có mật khẩu hoặc URL sai → undefined', () => {
    expect(passwordFromRedisUrl('redis://host:6380/0')).toBeUndefined();
    expect(passwordFromRedisUrl('không phải url')).toBeUndefined();
  });
});

describe('interpretSmtpBanner', () => {
  it('banner 220 là máy chủ SMTP sẵn sàng', () => {
    expect(interpretSmtpBanner('220 mailpit ESMTP Service ready\r\n').ok).toBe(true);
    expect(interpretSmtpBanner('220-nhieu dong\r\n220 xong\r\n').ok).toBe(true);
  });

  it('mã khác 220 (từ chối, lỗi) hoặc không phải SMTP → lỗi', () => {
    expect(interpretSmtpBanner('554 khong gui duoc\r\n').ok).toBe(false);
    expect(interpretSmtpBanner('HTTP/1.1 400 Bad Request').ok).toBe(false);
    expect(interpretSmtpBanner('').ok).toBe(false);
  });
});
