import { type ActionDenial, evaluateAction } from '../capabilities';
import { DECLARED_CAPABILITIES } from '../declarations';

/**
 * Cửa sổ nhắn tin Messenger (docs/12 §1, BR-14, R8): trong 24 giờ kể từ tin cuối của khách → gửi tự động được
 * (`messaging_type: RESPONSE`); 24 giờ–7 ngày → CHỈ người gửi, `MESSAGE_TAG` + `HUMAN_AGENT`; quá 7 ngày → không gửi.
 * Dùng chính khai báo `DECLARED_CAPABILITIES.facebook.sendMessage` (một nguồn sự thật với `evaluateAction`).
 */
export type MessengerSendMode =
  | { allowed: true; messagingType: 'RESPONSE' }
  | { allowed: true; messagingType: 'MESSAGE_TAG'; tag: 'HUMAN_AGENT' }
  | { allowed: false; reason: ActionDenial };

export function messengerSendMode(input: {
  lastUserMessageAt: Date;
  now: Date;
  /** Người bấm gửi (true) hay AI/hệ thống tự gửi (false). */
  byHuman: boolean;
}): MessengerSendMode {
  const decision = evaluateAction(DECLARED_CAPABILITIES.facebook, 'sendMessage', {
    referenceAt: input.lastUserMessageAt,
    now: input.now,
    byHuman: input.byHuman,
  });
  if (!decision.allowed) return { allowed: false, reason: decision.reason };
  return decision.humanOnly
    ? { allowed: true, messagingType: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }
    : { allowed: true, messagingType: 'RESPONSE' };
}
