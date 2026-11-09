// API công khai của module pipeline. Thêm export mới ở ĐÂY (không sửa src/index.ts).

export {
  type ConversationState,
  carryOverAsks,
  EMPTY_CONVERSATION_STATE,
  nextConversationState,
  parseConversationState,
} from './conversation-state';
export {
  type CommentUpdate,
  commentUpdateOf,
  type DonePipelineResult,
  HANDOFF_PLACEHOLDER_TEXT,
  handoffDraftInput,
  type PersistContext,
  toDraftInput,
  toGapInputs,
  toRetrievalInput,
} from './persist-records';
export {
  clampMaxAiReplies,
  DEFAULT_MAX_AI_REPLIES,
  evaluateReplyCap,
  type ReplyCapVerdict,
  replyCapClosingDecision,
} from './reply-cap';
export type { PipelineConvoInput } from './run-pipeline';
export {
  type PipelineDeps,
  type PipelineGate,
  type PipelineInput,
  type PipelineResult,
  type PipelineRiskInputs,
  type PipelineThread,
  runPipeline,
  type SlotDiagnostics,
} from './run-pipeline';
export {
  createTurnGate,
  type TurnBegin,
  type TurnBlockReason,
  type TurnPorts,
} from './turn-gate';
