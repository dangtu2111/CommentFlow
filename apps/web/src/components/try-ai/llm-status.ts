type Translate = (key: string, values?: Record<string, string>) => string;

/** Dòng trạng thái: bước nào của ô Thử AI đang chạy bằng LLM thật, bước nào còn là bản mô phỏng. Hàm thuần. */
export function llmStatusText(
  t: Translate,
  llm: { extractor: boolean; drafter: boolean; rewriter?: boolean },
): string {
  const steps = [
    llm.extractor ? t('llm.extractor') : null,
    llm.rewriter ? t('llm.rewriter') : null,
    llm.drafter ? t('llm.drafter') : null,
  ]
    .filter((step): step is string => step !== null)
    .join(', ');
  return steps === '' ? t('llm.off') : t('llm.on', { steps });
}
