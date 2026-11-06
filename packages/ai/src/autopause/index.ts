// API công khai của module autopause. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  AUTO_PAUSE_DEFAULTS,
  AUTO_PAUSE_REASONS,
  type AutoPauseConfig,
  type AutoPauseDecision,
  type AutoPauseInput,
  type AutoPauseReason,
  CHANNEL_SUSPEND_MS,
  type ChannelBlockError,
  evaluateAutoPause,
  type SendOutcome,
  SPIKE_FACTOR,
  SPIKE_MIN_SENT,
} from './auto-pause';
export {
  type ApplyResult,
  type AutoPauseResumeActor,
  type AutoPauseResumeResult,
  type AutoPauseService,
  createAutoPauseService,
} from './auto-pause-service';
export {
  type AutoPauseState,
  type AutoPauseStore,
  createInMemoryAutoPauseStore,
  initialAutoPauseState,
} from './auto-pause-store';
