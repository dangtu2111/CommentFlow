// API công khai của module history. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  AUTO_SENT_STATUSES,
  type AutoSentRecord,
  AutoSentRecordSchema,
  MARK_WRONG_ROLES,
  type MarkWrongRole,
} from './auto-sent-record';
export { createEmptyHistoryStore } from './empty-store';
export {
  decideMarkWrong,
  MAX_WRONG_REASON_LENGTH,
  type MarkWrongActor,
  type MarkWrongDecision,
  type MarkWrongErrorCode,
} from './mark-wrong';
export {
  evaluateMarkedWrongSignal,
  MARKED_WRONG_MIN_SENT,
  MARKED_WRONG_RATE_THRESHOLD,
  MARKED_WRONG_WINDOW_MS,
  type MarkedWrongSignal,
} from './marked-wrong-signal';
export {
  type AutoSentHistoryStore,
  createInMemoryHistoryStore,
  type HistoryPage,
  type HistoryQuery,
  type MarkWrongOutcome,
} from './memory-store';
