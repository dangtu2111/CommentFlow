// Sinh lại bộ mẫu `synthetic` (datasets/synthetic-demo.jsonl) từ `src/synthetic.ts`. Test đối chiếu tệp đã commit với kết quả này.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeDataset } from '../dataset';
import { generateSynthetic } from '../synthetic';

const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'datasets',
  'synthetic-demo.jsonl',
);
const samples = generateSynthetic();
writeFileSync(out, serializeDataset(samples));
console.log(`Đã ghi ${samples.length} mẫu synthetic vào ${out}`);
