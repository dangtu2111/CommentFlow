export type KiotVietConfig = { enabled: boolean };

/**
 * Cờ KiotViet từ biến môi trường do NƠI DỰNG truyền vào (FR-122, Q-KIO1). Mặc định TẮT: chỉ đúng chữ `true` mới bật.
 * Hàm thuần, không đọc `process.env`.
 */
export function readKiotVietConfig(env: Record<string, string | undefined>): KiotVietConfig {
  return { enabled: env.KIOTVIET_ENABLED === 'true' };
}
