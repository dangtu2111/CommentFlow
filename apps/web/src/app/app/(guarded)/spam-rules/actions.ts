'use server';

import { SpamRuleLimitError } from '@flow/db/runtime';
import type { SpamPreview } from '@flow/shared';
import { notFound } from 'next/navigation';
import { parseSpamRuleForm } from '../../../../lib/spam-rules-form';
import { requireAppUser } from '../../../../server/require-app-user';
import { spamRules } from '../../../../server/spam-rules';

/** Trạng thái form (đọc bằng `useActionState`). */
export type SpamRuleState =
  | { status: 'idle' | 'saved' }
  | { status: 'preview'; preview: SpamPreview }
  | { status: 'error'; code: 'invalid_rule' | 'limit_reached' | 'unavailable' };

/**
 * Xem trước / lưu quy tắc spam (FR-080, US-050). Chỉ Owner (Staff nhận 404); workspace lấy từ `requireAppUser`.
 * Xem trước chỉ đọc. Lưu vào `cf.rules` (0049); quá trần 50 quy tắc → `limit_reached`.
 */
export async function spamRuleAction(_prev: SpamRuleState, data: FormData): Promise<SpamRuleState> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const parsed = parseSpamRuleForm(data);
  if (!parsed.ok) {
    if (parsed.code === 'bad_request') notFound();
    return { status: 'error', code: parsed.code };
  }
  const ctx = { workspaceId: workspace.id, userId: user.id };
  try {
    if (parsed.intent === 'preview') {
      return { status: 'preview', preview: await spamRules().preview(ctx, parsed.rule) };
    }
    const saved = await spamRules().save(ctx, parsed.rule);
    return saved === 'ok' ? { status: 'saved' } : { status: 'error', code: 'unavailable' };
  } catch (error) {
    if (error instanceof SpamRuleLimitError) return { status: 'error', code: 'limit_reached' };
    return { status: 'error', code: 'unavailable' };
  }
}
