// API công khai của module autohide. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  AUTO_HIDE_ELIGIBLE_STATUSES,
  AUTO_HIDE_RULE_TYPES,
  type AutoHideComment,
  type AutoHideConfig,
  type AutoHidePlan,
  type AutoHideResult,
  type AutoHideRule,
  type AutoHideRuleType,
  type AutoHideSkipReason,
  type HideRequester,
  loadAutoHideConfig,
  planAutoHide,
  runAutoHide,
} from './auto-hide';
