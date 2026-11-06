export type PancakeConfig = { enabled: boolean };

/**
 * Cờ Pancake POS từ biến môi trường do NƠI DỰNG truyền vào (FR-122, Q-PAN1). Mặc định TẮT: chỉ đúng chữ `true` mới
 * bật. Hàm thuần, không đọc `process.env`.
 */
export function readPancakeConfig(env: Record<string, string | undefined>): PancakeConfig {
  return { enabled: env.PANCAKE_ENABLED === 'true' };
}
