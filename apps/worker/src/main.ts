import { loadConfig } from './config';
import { startHealthServer } from './health';
import { createLogger } from './logger';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel });

  // Cờ "sẵn sàng": hiện chỉ cần tiến trình đã khởi động; bước nối pg-boss sẽ bổ sung điều kiện kết nối DB.
  let ready = false;
  const health = await startHealthServer({ port: config.port, isReady: () => ready });
  ready = true;
  logger.info({ port: config.port }, 'worker đã khởi động');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker đang dừng');
    ready = false;
    await health.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('worker không khởi động được:', error instanceof Error ? error.message : error);
  process.exit(1);
});
