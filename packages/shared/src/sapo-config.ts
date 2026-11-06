export type SapoConfig = { enabled: boolean };

/**
 * Cờ Sapo từ biến môi trường do NƠI DỰNG truyền vào (FR-122, Q-SAP1). Mặc định TẮT: chỉ đúng chữ `true` mới bật.
 * Hàm thuần, không đọc `process.env`.
 */
export function readSapoConfig(env: Record<string, string | undefined>): SapoConfig {
  return { enabled: env.SAPO_ENABLED === 'true' };
}
