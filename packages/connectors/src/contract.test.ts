import { describe, expect, it } from 'vitest';
import { checkConnectorContract } from './contract';
import { PLATFORM_ERROR_CODES, PlatformError } from './errors';
import { createFakeConnector } from './testing';
import { PLATFORMS, type PlatformConnector } from './types';

describe('FR-016 hợp đồng connector (checkConnectorContract)', () => {
  it.each(PLATFORMS)('FR-016 connector giả của %s thỏa hợp đồng', (platform) => {
    expect(checkConnectorContract(createFakeConnector(platform))).toEqual([]);
  });

  it('FR-016 platform lạ → vi phạm', () => {
    const fb = createFakeConnector('facebook');
    const broken = { ...fb, platform: 'myspace' } as unknown as PlatformConnector;
    expect(checkConnectorContract(broken).join('\n')).toMatch(/platform lạ/);
  });

  it('FR-016 khai báo hỗ trợ ẩn nhưng thiếu setHidden → vi phạm', () => {
    const fb = createFakeConnector('facebook');
    const broken: PlatformConnector = { ...fb, setHidden: undefined };
    expect(checkConnectorContract(broken).join('\n')).toMatch(/hide.*setHidden/);
  });

  it('FR-016 khai báo KHÔNG hỗ trợ ẩn nhưng vẫn có setHidden → vi phạm (UI ẩn nút nhưng mã vẫn gọi được)', () => {
    const tt = createFakeConnector('tiktok');
    const broken: PlatformConnector = { ...tt, setHidden: async () => undefined };
    expect(checkConnectorContract(broken).join('\n')).toMatch(/setHidden/);
  });

  it('FR-016 thiếu reply khi khai báo trả lời, hoặc có sendMessage khi khai báo không hỗ trợ → vi phạm', () => {
    const fb = createFakeConnector('facebook');
    const noReply = { ...fb, reply: undefined } as unknown as PlatformConnector;
    expect(checkConnectorContract(noReply).join('\n')).toMatch(/reply/);
    const ig = createFakeConnector('instagram');
    const extra: PlatformConnector = { ...ig, sendMessage: async () => ({ externalId: 'x' }) };
    expect(checkConnectorContract(extra).join('\n')).toMatch(/sendMessage/);
  });

  it('FR-016 mapError phải luôn trả mã trong 5 mã chuẩn, kể cả với giá trị không phải Error', () => {
    const fb = createFakeConnector('facebook');
    const bad: PlatformConnector = {
      ...fb,
      mapError: () => new PlatformError('KHONG_CO' as never),
    };
    expect(checkConnectorContract(bad).join('\n')).toMatch(/mapError/);
    for (const input of [new Error('x'), 'chuỗi', null, undefined, 42, { code: 190 }]) {
      expect(PLATFORM_ERROR_CODES).toContain(fb.mapError(input).code);
    }
  });

  it('FR-016 capabilities sai schema (cửa sổ không tăng dần) → vi phạm', () => {
    const fb = createFakeConnector('facebook');
    const broken: PlatformConnector = {
      ...fb,
      capabilities: {
        ...fb.capabilities,
        sendMessage: {
          supported: true,
          verified: true,
          windows: [
            { withinMs: 100, humanOnly: false },
            { withinMs: 50, humanOnly: true },
          ],
        },
      },
    };
    expect(checkConnectorContract(broken).join('\n')).toMatch(/capabilities/);
  });
});
