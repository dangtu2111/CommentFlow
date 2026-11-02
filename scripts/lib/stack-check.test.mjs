import { describe, expect, it } from 'vitest';
import {
  interpretPostgresReply,
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
