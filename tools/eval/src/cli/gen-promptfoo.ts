// Sinh promptfoo/tests.json từ một bộ mẫu JSONL: mỗi mẫu một test, các `assert` (kiểu javascript, có `metric` đặt tên) chỉ gồm
// kiểm tra áp dụng cho mẫu đó. Dùng: pnpm --filter @flow/eval gen:promptfoo [--dataset đường-dẫn]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseDataset } from '../dataset';
import { buildPromptfooTests, renderTests } from '../promptfoo-tests';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values } = parseArgs({
  options: { dataset: { type: 'string', default: resolve(ROOT, 'datasets/synthetic-demo.jsonl') } },
});
const samples = parseDataset(readFileSync(values.dataset as string, 'utf8'));
const out = resolve(ROOT, 'promptfoo/tests.json');
writeFileSync(out, renderTests(buildPromptfooTests(samples)));
console.log(`Đã ghi ${samples.length} test vào ${out}`);
