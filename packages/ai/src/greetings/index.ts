// API công khai của module greetings (FR-074). Thêm export mới ở ĐÂY.
export {
  GREETING_BLOCK_LABELS,
  GREETING_BLOCK_REASONS,
  GREETING_DEFAULT_COOLDOWN_HOURS,
  GREETING_KINDS,
  GREETING_RULE_COUNT,
  GREETING_WINDOW_MS,
  type GreetingBlockReason,
  type GreetingConfig,
  type GreetingKind,
  type GreetingResult,
  type GreetingTemplateSource,
  greetingConfigSchema,
  greetingInputSchema,
  selectGreeting,
} from './greetings';
