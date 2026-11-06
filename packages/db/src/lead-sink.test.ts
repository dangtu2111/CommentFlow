import { describe, expect, it, vi } from 'vitest';
import { createLeadCaptureFromEnv, createLeadContactSink } from './lead-sink';
import { createLeadVault, LeadKeyConfigError, parseLeadHashKey, parseLeadKeys } from './lead-vault';
import type { PreparedLead } from './queries/leads';

const HEX = 'a'.repeat(64);
const WS = '11111111-1111-4111-8111-111111111111';
const CH = '44444444-4444-4444-8444-444444444444';
const SRC = '55555555-5555-4555-8555-555555555555';

const vault = createLeadVault({
  encKeys: parseLeadKeys(`v1:${HEX}`),
  hashKey: parseLeadHashKey('c'.repeat(64)),
});

function setup() {
  const persisted: Array<{ ws: string; rows: readonly PreparedLead[] }> = [];
  const persist = vi.fn(async (ws: string, rows: readonly PreparedLead[]) => {
    persisted.push({ ws, rows });
  });
  const sink = createLeadContactSink({ vault, channelId: CH, sourceType: 'comment', persist });
  return { persist, persisted, sink };
}

describe('FR-082/FR-033 ContactSink thật: lưu liên hệ gốc trước khi che', () => {
  it('mã hóa SĐT + email, có băm và 4 số cuối, KHÔNG có bản rõ trong dữ liệu ghi', async () => {
    const { persisted, sink } = setup();
    await sink.save(WS, { phones: ['0912345678'], emails: ['an@x.vn'] }, { sourceId: SRC });
    const [call] = persisted;
    expect(call?.ws).toBe(WS);
    const [lead] = call?.rows ?? [];
    expect(lead).toMatchObject({
      channelId: CH,
      sourceType: 'comment',
      sourceId: SRC,
      keyVersion: 1,
    });
    expect(lead?.phone?.last4).toBe('5678');
    expect(lead?.phone?.hash).toHaveLength(32);
    const serialized = JSON.stringify(call?.rows);
    expect(serialized).not.toContain('0912345678');
    expect(serialized).not.toContain('an@x.vn');
    expect(
      vault.decrypt(lead?.phone?.enc as Buffer, 1, {
        workspaceId: WS,
        leadId: lead?.id as string,
        field: 'phone',
      }),
    ).toBe('0912345678');
    expect(
      vault.decrypt(lead?.email?.enc as Buffer, 1, {
        workspaceId: WS,
        leadId: lead?.id as string,
        field: 'email',
      }),
    ).toBe('an@x.vn');
  });

  it('băm của cùng SĐT giống nhau giữa hai lần lưu (để chống trùng)', async () => {
    const { persisted, sink } = setup();
    await sink.save(WS, { phones: ['+84912345678'], emails: [] }, {});
    await sink.save(WS, { phones: ['0912345678'], emails: [] }, {});
    const hashes = persisted.map((p) => p.rows[0]?.phone?.hash.toString('hex'));
    expect(hashes[0]).toBe(hashes[1]);
    expect(persisted[0]?.rows[0]?.id).not.toBe(persisted[1]?.rows[0]?.id);
  });

  it('không có liên hệ hợp lệ → không ghi gì', async () => {
    const { persist, sink } = setup();
    await sink.save(WS, { phones: ['123'], emails: ['rác'] }, {});
    expect(persist).not.toHaveBeenCalled();
  });

  it('sourceId không phải UUID → ghi với source_id null (không làm hỏng lần lưu)', async () => {
    const { persisted, sink } = setup();
    await sink.save(WS, { phones: ['0912345678'], emails: [] }, { sourceId: 'không-phải-uuid' });
    expect(persisted[0]?.rows[0]?.sourceId).toBeNull();
  });

  it('lỗi ghi DB được ném ra (maskAndCapture sẽ đổi thành saved:false) và không kèm PII', async () => {
    const persist = vi.fn(async () => {
      throw new Error('db down');
    });
    const sink = createLeadContactSink({ vault, channelId: CH, sourceType: 'message', persist });
    await expect(sink.save(WS, { phones: ['0912345678'], emails: [] }, {})).rejects.toThrow(
      'db down',
    );
  });
});

describe('FR-082 cờ ghi khách tiềm năng (mặc định TẮT)', () => {
  it('thiếu hoặc khác "true" → tắt, không đọc khóa', () => {
    expect(createLeadCaptureFromEnv({})).toEqual({ enabled: false });
    expect(createLeadCaptureFromEnv({ LEADS_CAPTURE_ENABLED: 'TRUE' })).toEqual({ enabled: false });
    expect(createLeadCaptureFromEnv({ LEADS_CAPTURE_ENABLED: '1' })).toEqual({ enabled: false });
  });

  it('bật nhưng thiếu/sai khóa → LeadKeyConfigError (không chạy ngầm không mã hóa)', () => {
    expect(() => createLeadCaptureFromEnv({ LEADS_CAPTURE_ENABLED: 'true' })).toThrow(
      LeadKeyConfigError,
    );
    expect(() =>
      createLeadCaptureFromEnv({
        LEADS_CAPTURE_ENABLED: 'true',
        LEADS_ENC_KEYS: `v1:${HEX}`,
        LEADS_HASH_KEY: 'ngắn',
      }),
    ).toThrow(LeadKeyConfigError);
  });

  it('bật với khóa đúng → có vault', () => {
    const cfg = createLeadCaptureFromEnv({
      LEADS_CAPTURE_ENABLED: 'true',
      LEADS_ENC_KEYS: `v1:${HEX}`,
      LEADS_HASH_KEY: 'c'.repeat(64),
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.enabled && cfg.vault.currentVersion).toBe(1);
  });
});
