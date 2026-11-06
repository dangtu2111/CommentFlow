export type HaravanConfig = { enabled: boolean };

/**
 * Cờ Haravan từ biến môi trường do NƠI DỰNG truyền vào (FR-122, Q-HRV1). Mặc định TẮT: chỉ đúng chữ `true` mới bật.
 * Hàm thuần, không đọc `process.env`.
 */
export function readHaravanConfig(env: Record<string, string | undefined>): HaravanConfig {
  return { enabled: env.HARAVAN_ENABLED === 'true' };
}
