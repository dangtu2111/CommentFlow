// API công khai của module ratelimit (FR-114). Thêm export mới ở ĐÂY (không sửa src/index.ts).
export { type HeaderBag, parseMetaUsagePercent } from './meta-usage';
export { loadSendRateConfig, type SendRateConfig } from './send-rate-config';
export {
  createInMemorySendRateCounter,
  SEND_RATE_SCOPES,
  type SendRateCounter,
  type SendRateScope,
  sendRateKey,
} from './send-rate-counter';
export {
  APP_USAGE_HUMAN_ONLY_PERCENT,
  APP_USAGE_SLOW_PERCENT,
  DEFAULT_SEND_RATE_LIMITS,
  evaluateSendRate,
  SEND_RATE_BLOCKS,
  type SendRateBlock,
  type SendRateDecision,
  type SendRateInput,
  type SendRateLimits,
} from './send-rate-limit';
export {
  createSendRateService,
  type SendRateService,
  type SendRateServiceDeps,
  type SendRateSnapshot,
  type SendRateTarget,
} from './send-rate-service';
