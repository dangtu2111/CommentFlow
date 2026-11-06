import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Kho tệp xuất dữ liệu (FR-094, Q-EXP1). Interface để thay bằng object storage (R2/S3) khi có tài nguyên
 * (`DATA-EXPORT-DELIVERY`); bản mặc định ghi vào thư mục cục bộ `DATA_EXPORT_DIR`.
 */
export interface ExportFileStore {
  /** Ghi tuần tự các dòng; trả số byte đã ghi. Ghi nguyên tử (tệp tạm rồi đổi tên). */
  put(key: string, lines: AsyncIterable<string>): Promise<{ bytes: number }>;
  /** Xóa tệp (không lỗi nếu không tồn tại). */
  remove(key: string): Promise<void>;
}

const KEY_PATTERN = /^exports\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jsonl$/;

/** Từ chối khóa lạ (chống `..`, đường dẫn tuyệt đối): chỉ nhận đúng dạng `exports/<ws>/<id>.jsonl`. */
function safePath(root: string, key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error('export_key_invalid');
  const full = resolve(root, key);
  if (!full.startsWith(resolve(root) + sep)) throw new Error('export_key_invalid');
  return full;
}

export function createLocalExportStore(rootDir: string): ExportFileStore {
  return {
    async put(key, lines) {
      const target = safePath(rootDir, key);
      const tmp = join(dirname(target), `.${Date.now()}.tmp`);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      let bytes = 0;
      async function* counted(): AsyncGenerator<string> {
        for await (const line of lines) {
          bytes += Buffer.byteLength(line);
          yield line;
        }
      }
      try {
        await pipeline(Readable.from(counted()), createWriteStream(tmp, { mode: 0o600 }));
        await rename(tmp, target);
      } catch (error) {
        await rm(tmp, { force: true });
        throw error;
      }
      return { bytes };
    },
    async remove(key) {
      await rm(safePath(rootDir, key), { force: true });
    },
  };
}
