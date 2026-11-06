// API công khai của module automation. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type AutomationConfig,
  type AutomationRule,
  automationConfigSchema,
  DAILY_CAP_MAX,
  DEFAULT_AUTOMATION_CONFIG,
  DELAY_SECONDS_OPTIONS,
  MATRIX_LABELS,
  MATRIX_TARGETS,
  MAX_BLOCKED_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MAX_SIGNATURE_LENGTH,
  type MatrixLabel,
  type MatrixTarget,
  modeFor,
  parseAutomationConfig,
  toGateSettings,
} from './settings';
export {
  type AutomationChange,
  type AutomationSettingsStore,
  createInMemoryAutomationSettingsStore,
} from './settings-store';
