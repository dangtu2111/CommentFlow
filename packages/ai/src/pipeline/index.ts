// API công khai của module pipeline. Thêm export mới ở ĐÂY (không sửa src/index.ts).

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
  type PipelineDeps,
  type PipelineGate,
  type PipelineInput,
  type PipelineResult,
  type PipelineRiskInputs,
  type PipelineThread,
  runPipeline,
} from './run-pipeline';
export {
  createTurnGate,
  type TurnBegin,
  type TurnBlockReason,
  type TurnPorts,
} from './turn-gate';
