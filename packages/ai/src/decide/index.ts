// API công khai của module decide. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type ActionDecision,
  AUTO_SEND_POLICIES,
  type AutoSendPolicy,
  CLARIFY_ASKS,
  type ClarifyAsk,
  type ClarifyAskKind,
  DECISION_REASONS,
  type DecideActionInput,
  type DecisionReason,
  decideAction,
  decideActionInputSchema,
  effectiveAutoSendPolicy,
  HANDOFF_TEMPLATE_KEYS,
  type HandoffTemplateKey,
  KB_GAP_TOPICS,
  type KbGapTopic,
  MAX_CLARIFY_OPTIONS,
  MAX_CLARIFY_PER_THREAD,
  REPEAT_HANDOFF_THRESHOLD,
  readDecideActionInput,
  VARIANT_AXES,
  type VariantAxis,
} from './decide-action';
export {
  type AttachmentRuleResult,
  evaluateAttachmentRules,
  type ImageDependenceSource,
  MAX_SHORT_TEXT_WORDS,
} from './handoff-rules';
export {
  DEFAULT_HUMAN_HOLD_MINUTES,
  evaluateHumanHold,
  type HumanHoldReason,
  type HumanHoldResult,
  MAX_HUMAN_HOLD_MINUTES,
} from './human-hold-rules';
export {
  evaluateImpersonation,
  IMPERSONATION_REASONS,
  type ImpersonationReason,
  type ImpersonationResult,
  MAX_COMMENT_LENGTH,
} from './impersonation-rules';
export {
  checkDraftLegal,
  type DraftLegalCheck,
  evaluateLegalRules,
  LEGAL_TOPICS,
  type LegalEvaluation,
  type LegalSource,
  type LegalTopic,
} from './legal-rules';
export {
  checkOrderReplyLeak,
  evaluateOrderInComment,
  handleOrderInComment,
  MAX_ORDER_COMMENT_LENGTH,
  ORDER_COMMENT_REASONS,
  ORDER_RECEIVED_REPLIES,
  type OrderCommentReason,
  type OrderInCommentOutcome,
  type OrderInCommentResult,
} from './order-comment-rules';
export {
  type BusinessHoursState,
  detectOrderStatusIntent,
  evaluateBusinessHours,
  type Invitation,
  type InvitationSource,
  type NextOpening,
  nextOpening,
  promisesImmediateReply,
  resolveInvitation,
  withOrderStatusTopic,
} from './order-hours-rules';
export {
  anyStockStale,
  DEFAULT_STOCK_STALE_DAYS,
  evaluateStockRules,
  MAX_ALTERNATIVES,
  type StockAlternative,
  type StockAvailability,
  type StockFreshness,
  type StockOutcome,
} from './stock-rules';
