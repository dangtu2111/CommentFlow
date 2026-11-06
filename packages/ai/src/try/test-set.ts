/**
 * Bộ câu kiểm thử kiến thức (FR-054, US-034): Owner viết vài câu hỏi mẫu kèm kết quả mong đợi, chạy từng câu qua
 * pipeline Thử AI (mock hoặc KB thật do nơi gọi chọn), rồi so với mong đợi trước khi xuất bản. Thuần: không đụng
 * DB/mạng/bộ đếm lượt; việc chạy từng câu do hàm `run` được tiêm. Không có ca nào → cổng KHÔNG đạt (không bằng chứng
 * thì không cho qua). Lỗi một ca chỉ ghi TÊN lỗi (không lộ nội dung/chi tiết nội bộ).
 */
import { z } from 'zod';
import type { ActionKind } from '../confidence/confidence';
import { TRY_MAX_CHARS, type TryResult } from './try-pipeline';

export const TESTSET_MAX_CASES = 20;
const MAX_KEYWORDS = 5;
const MAX_KEYWORD_CHARS = 100;

export const TEST_EXPECT_ACTIONS = ['answer', 'clarify', 'redirect', 'handoff', 'skip'] as const;
/** `skip` = pipeline bỏ qua bình luận (chỉ emoji/tag/dấu câu). */
export type TestExpectAction = (typeof TEST_EXPECT_ACTIONS)[number];

const testCaseSchema = z.object({
  question: z.string().trim().min(1).max(TRY_MAX_CHARS),
  expectAction: z.enum(TEST_EXPECT_ACTIONS),
  /** Mỗi từ khóa phải xuất hiện trong câu trả lời (không phân biệt hoa thường/dấu). */
  replyIncludes: z
    .array(z.string().trim().min(1).max(MAX_KEYWORD_CHARS))
    .max(MAX_KEYWORDS)
    .default([]),
});

export type TestCase = z.infer<typeof testCaseSchema>;

export type ParseTestCasesResult =
  | { ok: true; cases: TestCase[] }
  | { ok: false; reason: 'empty' | 'too_many' }
  | { ok: false; reason: 'invalid'; index: number };

/** Kiểm đầu vào ở ranh giới (Zod); `index` tính từ 0. */
export function parseTestCases(raw: unknown): ParseTestCasesResult {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, reason: 'empty' };
  if (raw.length > TESTSET_MAX_CASES) return { ok: false, reason: 'too_many' };
  const cases: TestCase[] = [];
  for (const [index, item] of raw.entries()) {
    const parsed = testCaseSchema.safeParse(item);
    if (!parsed.success) return { ok: false, reason: 'invalid', index };
    cases.push(parsed.data);
  }
  return { ok: true, cases };
}

export type TestFailure = 'action_mismatch' | 'reply_missing' | 'guard_failed';

export type TestCaseResult = {
  index: number;
  question: string;
  status: 'pass' | 'fail' | 'error';
  expected: TestExpectAction;
  /** Hành động thực tế (`skip` khi pipeline bỏ qua); không có khi lỗi. */
  actual?: ActionKind | 'skip';
  reply?: string;
  failures: TestFailure[];
  /** Từ khóa mong đợi nhưng không thấy trong câu trả lời. */
  missing: string[];
  /** Tên lỗi (không kèm chi tiết). */
  error?: string;
};

export type TestSetSummary = {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  /** `pass` chỉ khi có ≥ 1 ca và mọi ca đạt. */
  gate: 'pass' | 'fail';
};

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();

function evaluate(index: number, testCase: TestCase, result: TryResult): TestCaseResult {
  const base = { index, question: testCase.question, expected: testCase.expectAction };
  if (result.status === 'skipped') {
    const failures: TestFailure[] = testCase.expectAction === 'skip' ? [] : ['action_mismatch'];
    return {
      ...base,
      status: failures.length === 0 ? 'pass' : 'fail',
      actual: 'skip',
      failures,
      missing: [],
    };
  }
  const failures: TestFailure[] = [];
  const actual = result.decision.action;
  if (actual !== testCase.expectAction) failures.push('action_mismatch');
  const reply = fold(result.reply);
  const missing = testCase.replyIncludes.filter((word) => !reply.includes(fold(word)));
  if (missing.length > 0) failures.push('reply_missing');
  if (!result.guard.ok) failures.push('guard_failed');
  return {
    ...base,
    status: failures.length === 0 ? 'pass' : 'fail',
    actual,
    reply: result.reply,
    failures,
    missing,
  };
}

export function summarizeTestSet(results: readonly TestCaseResult[]): TestSetSummary {
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const errored = results.filter((r) => r.status === 'error').length;
  return {
    total: results.length,
    passed,
    failed,
    errored,
    gate: results.length > 0 && passed === results.length ? 'pass' : 'fail',
  };
}

/** Chạy tuần tự từng ca (giữ thứ tự, không dồn tải LLM/DB); lỗi một ca không làm hỏng ca khác. */
export async function runTestSet(
  cases: readonly TestCase[],
  run: (text: string) => Promise<TryResult>,
): Promise<{ results: TestCaseResult[]; summary: TestSetSummary }> {
  const results: TestCaseResult[] = [];
  for (const [index, testCase] of cases.entries()) {
    try {
      results.push(evaluate(index, testCase, await run(testCase.question)));
    } catch (error) {
      results.push({
        index,
        question: testCase.question,
        status: 'error',
        expected: testCase.expectAction,
        failures: [],
        missing: [],
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  return { results, summary: summarizeTestSet(results) };
}
