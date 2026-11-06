// API công khai của module private-reply (FR-046). Thêm export mới ở ĐÂY.
export {
  PRIVATE_REPLY_MAX_TEXT_LENGTH,
  PRIVATE_REPLY_REASON_LABELS,
  PRIVATE_REPLY_REASONS,
  PRIVATE_REPLY_RULE_COUNT,
  PRIVATE_REPLY_WINDOW_MS,
  type PrivateReplyInput,
  type PrivateReplyReason,
  type PrivateReplyResult,
  privateReplyCheck,
  privateReplyDeadline,
  privateReplyInputSchema,
} from './private-reply-check';
