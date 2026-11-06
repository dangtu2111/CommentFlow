// API công khai của module abuse (ABUSE-JOB, FR-115). Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type AbuseDecision,
  type AbuseInput,
  type AbuseSignal,
  type AbuseSignalName,
  type AbuseWarning,
  evaluateAbuse,
  evaluateRemovedAfterSend,
  REMOVED_AFTER_SEND_MIN_SENT,
  type ScopedSendOutcome,
} from './abuse-signals';
export {
  type AbuseNotification,
  type AbuseReview,
  type AbuseSink,
  type ChannelSuspension,
  createInMemoryAbuseSink,
  type InMemoryAbuseSink,
} from './abuse-sink';
export {
  type BannedKeywordHit,
  DEFAULT_BANNED_KEYWORDS,
  type ScanItem,
  scanBannedKeywords,
} from './banned-keywords';
