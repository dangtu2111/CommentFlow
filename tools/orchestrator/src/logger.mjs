// Log (dòng thường hoặc JSON-lines) + file cảnh báo để theo dõi từ xa.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const ALERT_TYPES = ['MERGED', 'KẸT', 'HẾT HÀNG ĐỢI'];

export function formatLine(format, entry) {
  if (format === 'json') return JSON.stringify(entry);
  const extra = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `${entry.ts} [${entry.lane}] ${entry.msg}${extra}`;
}

export function formatAlert(entry) {
  return `${entry.ts}\t${entry.type}\t${entry.lane}\t${entry.msg}`;
}

export function createLogger({
  stateDir,
  lane,
  format,
  now = () => new Date(),
  out = console.log,
}) {
  mkdirSync(stateDir, { recursive: true });
  const logFile = join(stateDir, `${lane}.log`);
  const alertFile = join(stateDir, 'alerts.txt');
  const ts = () => now().toISOString();
  return {
    log(msg, data) {
      const line = formatLine(format, { ts: ts(), lane, msg, ...(data ? { data } : {}) });
      appendFileSync(logFile, `${line}\n`);
      out(line);
    },
    // Cảnh báo kết quả (MERGED/KẸT/HẾT HÀNG ĐỢI) ghi riêng: "đã chạy xong" của lệnh nền chỉ nghĩa là khởi chạy.
    alert(type, msg) {
      appendFileSync(alertFile, `${formatAlert({ ts: ts(), type, lane, msg })}\n`);
      this.log(`${type}: ${msg}`);
    },
  };
}
