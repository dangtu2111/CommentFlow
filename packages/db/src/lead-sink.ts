import { randomUUID } from 'node:crypto';
import { type ExtractedContacts, phoneLast4, planLeadsFromContacts } from '@flow/shared';
import type { Database } from './client';
import { createLeadVault, type LeadVault, parseLeadHashKey, parseLeadKeys } from './lead-vault';
import { type LeadSourceType, type PreparedLead, recordLeads } from './queries/leads';

/**
 * `ContactSink` thật cho PII-MASK-PIPE (FR-033/FR-082): nhận liên hệ GỐC (chưa che), mã hóa + băm rồi ghi `cf.leads`.
 * Cấu trúc khớp interface `ContactSink` của `@flow/ai` (db không import ai — nguyên tắc tầng). Một sink = một nguồn
 * (kênh + loại nguồn) nên bên nối pipeline tạo sink theo từng bình luận/tin. Lỗi ghi được ném ra: `maskAndCapture`
 * đổi thành `saved:false` và KHÔNG log nội dung (nguyên tắc #6).
 */
export type LeadPersist = (workspaceId: string, leads: readonly PreparedLead[]) => Promise<void>;

/** Ghi qua `withJob` (cf_worker): `run` = `db.withJob`. Cả nhóm lead một giao dịch. */
export function persistLeadsWith(
  run: <T>(workspaceId: string, fn: (tx: Database) => Promise<T>) => Promise<T>,
): LeadPersist {
  return async (workspaceId, leads) => {
    await run(workspaceId, (tx) => recordLeads(tx, workspaceId, leads));
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createLeadContactSink(deps: {
  vault: LeadVault;
  channelId: string;
  sourceType: LeadSourceType;
  persist: LeadPersist;
}) {
  const { vault, channelId, sourceType, persist } = deps;
  return {
    async save(
      workspaceId: string,
      contacts: ExtractedContacts,
      meta: { sourceId?: string },
    ): Promise<void> {
      const sourceId = meta.sourceId && UUID.test(meta.sourceId) ? meta.sourceId : null;
      const prepared = planLeadsFromContacts(contacts).map((draft): PreparedLead => {
        const id = randomUUID();
        const phone = draft.phone
          ? {
              ...vault.encrypt(draft.phone, { workspaceId, leadId: id, field: 'phone' }),
              hash: vault.blindIndex(workspaceId, 'phone', draft.phone),
              last4: phoneLast4(draft.phone),
            }
          : null;
        const email = draft.email
          ? {
              ...vault.encrypt(draft.email, { workspaceId, leadId: id, field: 'email' }),
              hash: vault.blindIndex(workspaceId, 'email', draft.email),
            }
          : null;
        return {
          id,
          channelId,
          sourceType,
          sourceId,
          phone: phone ? { enc: phone.ciphertext, hash: phone.hash, last4: phone.last4 } : null,
          email: email ? { enc: email.ciphertext, hash: email.hash } : null,
          keyVersion: vault.currentVersion,
        };
      });
      if (prepared.length === 0) return;
      await persist(workspaceId, prepared);
    },
  };
}

export type LeadCaptureConfig = { enabled: false } | { enabled: true; vault: LeadVault };

/**
 * Cờ `LEADS_CAPTURE_ENABLED` (MẶC ĐỊNH TẮT; chỉ đúng chữ `true` mới bật). Bật mà thiếu/sai `LEADS_ENC_KEYS`/
 * `LEADS_HASH_KEY` → `LeadKeyConfigError` ngay lúc khởi động (không chạy ngầm không mã hóa).
 */
export function createLeadCaptureFromEnv(
  env: Record<string, string | undefined>,
): LeadCaptureConfig {
  if (env.LEADS_CAPTURE_ENABLED !== 'true') return { enabled: false };
  const vault = createLeadVault({
    encKeys: parseLeadKeys(env.LEADS_ENC_KEYS),
    hashKey: parseLeadHashKey(env.LEADS_HASH_KEY),
  });
  return { enabled: true, vault };
}
