/**
 * Xem trước "có được tự gửi không, vì sao" cho ô Thử AI (FR-059, US-034). CHỈ để hiển thị: cổng thật
 * (`decideAutoSend`, docs/09 §6) là việc `AUTO-SEND-GATE`; ở đây dùng cùng các điều kiện chắc chắn đã có
 * (policy, cần người, ngưỡng 0,85, guard số tiền) và luôn nghiêng về chặn. Hàm thuần.
 */

import type { AutoSendPolicy } from '../decide/decide-action';
import { effectiveAutoSendPolicy } from '../decide/decide-action';

/** Ngưỡng mặc định (docs/09 §6 mục 5); sàn 0,80 do Owner chỉnh ở cổng thật. */
export const AUTO_SEND_THRESHOLD = 0.85;

export const AUTO_SEND_BLOCK_REASONS = [
  'auto_send_off',
  'needs_human',
  'policy_never',
  'low_confidence',
  'guard_money',
  'empty_reply',
] as const;
export type AutoSendBlockReason = (typeof AUTO_SEND_BLOCK_REASONS)[number];

export type AutoSendPreviewInput = {
  /** Owner đã bật tự gửi cho (kênh, nhãn, ngôn ngữ) hay chưa; ô Thử AI cho biết kết quả NẾU được bật. */
  autoSendEnabled: boolean;
  decision: { action: string; needsHuman: boolean; autoSendPolicy: AutoSendPolicy };
  draft: { needs_human: boolean; reply: string; claims: ReadonlyArray<{ kind: string }> };
  confidence: { confidence: number; needsHuman: boolean };
  guardOk: boolean;
};

export type AutoSendPreview = { allowed: boolean; reasons: AutoSendBlockReason[] };

export function decideAutoSendPreview(input: AutoSendPreviewInput): AutoSendPreview {
  const reasons = new Set<AutoSendBlockReason>();
  const policy = effectiveAutoSendPolicy(input.decision.autoSendPolicy, input.draft);

  if (!input.autoSendEnabled) reasons.add('auto_send_off');
  if (input.decision.needsHuman || input.draft.needs_human || input.confidence.needsHuman) {
    reasons.add('needs_human');
  }
  if (policy === 'never') reasons.add('policy_never');
  if (input.confidence.confidence < AUTO_SEND_THRESHOLD) reasons.add('low_confidence');
  if (!input.guardOk) reasons.add('guard_money');
  if (input.draft.reply.trim() === '') reasons.add('empty_reply');

  const list = AUTO_SEND_BLOCK_REASONS.filter((reason) => reasons.has(reason));
  return { allowed: list.length === 0, reasons: list };
}
