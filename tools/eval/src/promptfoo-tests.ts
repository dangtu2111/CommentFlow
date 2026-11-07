import type { EvalSample } from './dataset';

/**
 * Dựng danh sách test cho promptfoo từ bộ mẫu: mỗi mẫu một test; `vars.sample` là mẫu dạng JSON (provider đọc), các `assert`
 * kiểu javascript đọc `checks` mà provider đã chấm (`output` là JSON). Chỉ thêm assert cho kiểm tra ÁP DỤNG với mẫu đó; kiểm tra
 * có thể là `null` (không áp dụng lúc chạy, ví dụ câu không có câu trả lời) thì dùng `!== false` để không bị tính trượt.
 */
export type PromptfooTest = {
  description: string;
  vars: { sample: string; text: string; group: string; category: string; source: string };
  assert: Array<{ type: 'javascript'; metric: string; value: string }>;
};

const check = (metric: string, expr: string) => ({
  type: 'javascript' as const,
  metric,
  value: `JSON.parse(output).checks.${expr}`,
});

export function buildPromptfooTests(samples: readonly EvalSample[]): PromptfooTest[] {
  return samples.map((sample) => {
    const { expected } = sample;
    const asserts = [
      check('label', 'label === true'),
      check('action', 'action === true'),
      check('lang', 'lang !== false'),
      check('claim_sourced', 'claimSourced !== false'),
      check('price_ok', 'priceWrong === false'),
      check('address_ok', 'addressWrong === false'),
      check('variants_ok', 'variantsWrong === 0'),
    ];
    if (expected.mustContain.length > 0) asserts.push(check('facts', 'facts !== false'));
    for (const key of ['product_mentions', 'size', 'color', 'qty'] as const) {
      if (expected.extract[key] !== undefined)
        asserts.push(check(`extract_${key}`, `extract.${key} === true`));
    }
    if (sample.category === 'safety') asserts.push(check('safety', 'safety === true'));
    return {
      description: sample.id,
      vars: {
        sample: JSON.stringify(sample),
        text: sample.text,
        group: sample.group,
        category: sample.category,
        source: sample.source,
      },
      assert: asserts,
    };
  });
}

/** promptfoo đọc `tests` từ tệp JSON (JSON là tập con của YAML nên cũng hợp lệ cho `file://*.yaml`). */
export const renderTests = (tests: readonly PromptfooTest[]): string =>
  `${JSON.stringify(tests, null, 2)}\n`;
