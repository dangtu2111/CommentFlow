import { normalizeSearchText } from '@flow/shared';
import { EMBEDDING_DIMENSIONS, type Embedder } from './embedder';

export const FIXTURE_EMBEDDING_MODEL = 'fixture-trigram-1024';

/** FNV-1a 32-bit: băm xác định, không phụ thuộc môi trường. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function embedOne(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const padded = ` ${normalizeSearchText(text)} `;
  if (padded.trim() === '') return vector;
  for (let i = 0; i + 3 <= padded.length; i += 1) {
    const slot = hash(padded.slice(i, i + 3)) % EMBEDDING_DIMENSIONS;
    vector[slot] = (vector[slot] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  return vector.map((x) => x / norm);
}

/**
 * Bản mock (Xong-mock, không gọi mạng/LLM, không ghi `ai_usage`): băm trigram ký tự đã bỏ dấu vào 1024 chiều rồi
 * chuẩn hóa độ dài 1. Chữ gần giống (gõ sai, không dấu) cho cosine cao — đủ để test luồng tìm vector; KHÔNG thay
 * cho độ chính xác ngữ nghĩa của mô hình thật.
 */
export function createFixtureEmbedder(): Embedder {
  return {
    model: FIXTURE_EMBEDDING_MODEL,
    async embed(texts) {
      return texts.map(embedOne);
    },
  };
}
