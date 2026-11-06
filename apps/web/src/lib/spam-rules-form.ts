import { parseSpamRule, type SpamRule } from '@flow/shared';

/**
 * Form "Quy tắc spam" (FR-080): phần thuần — kiểm đầu vào, không React/DB. `action` do client gửi vẫn đi qua Zod nên
 * `auto_hide` bị từ chối (Tự ẩn là việc riêng, AI không tự ẩn).
 */
type FormLike = { get(key: string): unknown };

export type SpamRuleIntent = 'preview' | 'save';
export type SpamRuleFormResult =
  | { ok: true; intent: SpamRuleIntent; rule: SpamRule }
  | { ok: false; code: 'bad_request' | 'invalid_rule' };

/** `bad_request` (ý định lạ) → nơi gọi trả 404; `invalid_rule` → báo lỗi tại chỗ. */
export function parseSpamRuleForm(data: FormLike): SpamRuleFormResult {
  const intent = data.get('intent');
  if (intent !== 'preview' && intent !== 'save') return { ok: false, code: 'bad_request' };
  const rule = parseSpamRule({
    name: data.get('name'),
    type: data.get('type'),
    pattern: data.get('pattern') ?? '',
    action: data.get('action'),
  });
  if (!rule.success) return { ok: false, code: 'invalid_rule' };
  return { ok: true, intent, rule: rule.data };
}
