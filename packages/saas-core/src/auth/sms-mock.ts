import { maskPhone } from './phone';
import type { SmsProvider } from './phone-verify';

/**
 * SMS MOCK (không gửi tin thật). Chỉ cho `APP_ENV` dev/test: ghi log với SĐT ĐÃ CHE kèm mã OTP để người thử lấy mã, và
 * (tùy chọn) thêm một dòng JSON vào "hộp thư thử" cho E2E đọc. Staging/production → từ chối ngay, không ghi gì
 * (mã OTP không bao giờ vào log thật). Nhà cung cấp SMS thật: xem `docs/can-ban-cung-cap.d/`.
 */
export function createMockSmsProvider(options: {
  appEnv: string;
  log: (line: string) => void;
  outbox?: { append: (line: string) => Promise<void> };
}): SmsProvider {
  return {
    async send(message) {
      if (!['dev', 'test', 'ci'].includes(options.appEnv)) {
        throw new Error('SmsProvider MOCK chỉ chạy ở APP_ENV=dev/test/ci.');
      }
      const code = /\b(\d{6})\b/.exec(message.text)?.[1] ?? '';
      const to = maskPhone(message.to);
      options.log(`[sms-mock] gửi tới ${to}: mã ${code}`);
      if (options.outbox) {
        await options.outbox.append(`${JSON.stringify({ at: new Date().toISOString(), to, code })}\n`);
      }
    },
  };
}
