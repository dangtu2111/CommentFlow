// API công khai của module delay. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type AfterCancel,
  type AutoSendTimer,
  CANCEL_REASONS,
  type CancelReason,
  type CancelResult,
  cancelAutoSendTimer,
  dispatchAutoSendTimer,
  planAutoSendDelay,
  resolveAutoSendTimer,
  type SystemCancelReason,
} from './auto-send-delay';
export {
  type AutoSendDelayScheduler,
  createInMemoryAutoSendDelayScheduler,
  type ScheduleInput,
  type ScheduleResult,
} from './delay-scheduler';
