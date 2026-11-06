import { AppError } from '@flow/shared';
import { z } from 'zod';

/**
 * Giới hạn ngân sách khóa ảo LiteLLM (LITELLM-LANGFUSE, FR-034): chỉ dựng tham số cho `/key/generate`
 * (`max_budget`, `budget_duration`, `model_max_budget`) và đánh giá mức đã dùng. Chưa gọi LiteLLM thật;
 * khóa theo workspace (`AI-VIRTUALKEY`) cần bảng → làn b.
 */
export const BUDGET_WARN_RATIO = 0.8;

const periodSchema = z.enum(['1d', '7d', '30d']);
const usdSchema = z.number().positive().finite();

const budgetInputSchema = z.object({
  maxBudgetUsd: usdSchema,
  period: periodSchema,
  perModelUsd: z.record(z.string().min(1), usdSchema).optional(),
});

export type KeyBudgetInput = z.input<typeof budgetInputSchema>;

export type KeyBudget = {
  max_budget: number;
  budget_duration: z.infer<typeof periodSchema>;
  model_max_budget?: Record<
    string,
    { budget_limit: number; time_period: z.infer<typeof periodSchema> }
  >;
};

export function buildKeyBudget(rawInput: KeyBudgetInput): KeyBudget {
  const parsed = budgetInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Tham số ngân sách khóa ảo không hợp lệ.');
  }
  const { maxBudgetUsd, period, perModelUsd } = parsed.data;
  const out: KeyBudget = { max_budget: maxBudgetUsd, budget_duration: period };
  if (perModelUsd) {
    out.model_max_budget = Object.fromEntries(
      Object.entries(perModelUsd).map(([model, limit]) => [
        model,
        { budget_limit: limit, time_period: period },
      ]),
    );
  }
  return out;
}

const usageSchema = z.object({
  spentUsd: z.number().nonnegative().finite(),
  maxBudgetUsd: usdSchema,
});

export type BudgetStatus = { status: 'ok' | 'warn' | 'exceeded'; ratio: number };

export function checkBudget(rawInput: z.input<typeof usageSchema>): BudgetStatus {
  const parsed = usageSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Số liệu ngân sách không hợp lệ.');
  }
  const ratio = parsed.data.spentUsd / parsed.data.maxBudgetUsd;
  if (ratio >= 1) return { status: 'exceeded', ratio };
  if (ratio >= BUDGET_WARN_RATIO) return { status: 'warn', ratio };
  return { status: 'ok', ratio };
}
