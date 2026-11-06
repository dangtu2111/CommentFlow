import { DEFAULT_SEND_RATE_LIMITS, type SendRateLimits } from './send-rate-limit';

/**
 * Cấu hình giới hạn tốc độ gửi (FR-114). Cờ MẶC ĐỊNH TẮT: chỉ đúng chữ `true` mới bật (tắt → `rate: null`,
 * R9 của `sendRecheck` cho qua như trước). Ngưỡng ghi đè bằng số nguyên dương; giá trị lạ → mặc định docs/09 §11.1.
 */
export type SendRateConfig = { enabled: boolean; limits: SendRateLimits };

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || !/^[1-9]\d{0,8}$/.test(raw)) return fallback;
  return Number(raw);
}

export function loadSendRateConfig(env: Record<string, string | undefined>): SendRateConfig {
  const d = DEFAULT_SEND_RATE_LIMITS;
  return {
    enabled: env.SEND_RATE_LIMIT_ENABLED === 'true',
    limits: {
      pagePerMinute: positiveInt(env.SEND_RATE_PAGE_PER_MINUTE, d.pagePerMinute),
      pagePerHour: positiveInt(env.SEND_RATE_PAGE_PER_HOUR, d.pagePerHour),
      autoPerHour: positiveInt(env.SEND_RATE_AUTO_PER_HOUR, d.autoPerHour),
      postPer10Min: positiveInt(env.SEND_RATE_POST_PER_10MIN, d.postPer10Min),
      repeatPerHour: positiveInt(env.SEND_RATE_REPEAT_PER_HOUR, d.repeatPerHour),
    },
  };
}
