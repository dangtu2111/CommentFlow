import { parseTestCases, type TestCase } from '@flow/ai';
import { KB_TESTSET_MAX_LINES } from './kb-testset-limits';

export { KB_TESTSET_MAX_LINES };

export type ParseTestSetTextResult =
  | { ok: true; cases: TestCase[] }
  | { ok: false; reason: 'empty' | 'too_many' }
  | { ok: false; reason: 'invalid_line'; line: number };

/**
 * Đọc ô văn bản của form: mỗi dòng `câu hỏi | hành động | từ khóa1; từ khóa2` (từ khóa tùy chọn). Dòng trống bị bỏ;
 * số dòng báo lỗi tính từ 1 trên văn bản gốc. Việc kiểm giá trị do `parseTestCases` (Zod) làm.
 */
export function parseTestSetText(raw: unknown): ParseTestSetTextResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  const lines = raw
    .split(/\r?\n/)
    .map((text, i) => ({ text: text.trim(), line: i + 1 }))
    .filter((l) => l.text !== '');
  if (lines.length === 0) return { ok: false, reason: 'empty' };
  if (lines.length > KB_TESTSET_MAX_LINES) return { ok: false, reason: 'too_many' };

  const items = lines.map(({ text }) => {
    const [question = '', expectAction = '', keywords = ''] = text.split('|').map((p) => p.trim());
    return {
      question,
      expectAction: expectAction.toLowerCase(),
      replyIncludes:
        keywords === ''
          ? []
          : keywords
              .split(';')
              .map((k) => k.trim())
              .filter((k) => k !== ''),
    };
  });
  const parsed = parseTestCases(items);
  if (parsed.ok) return { ok: true, cases: parsed.cases };
  if (parsed.reason === 'invalid') {
    return { ok: false, reason: 'invalid_line', line: lines[parsed.index]?.line ?? 1 };
  }
  return { ok: false, reason: parsed.reason };
}
