// API công khai của module fact plan (ADR 017, DRAFT-FACT-SLOTS). Thêm export mới ở ĐÂY.

export { fallbackTemplate, inviteUnknownText, requiredFactIds } from './compose';
export { type Claim, type FillResult, fillSlots, formatMoney } from './fill';
export { buildFactPlan } from './plan';
export { canonicalProvince, findProvinces, PROVINCES, sameProvince } from './regions';
export {
  checkSlotText,
  type SlotCheck,
  type SlotViolationCode,
  sameSlotSet,
  slotIds,
} from './slots';
export { factTopicsOf } from './topics';
export type {
  Fact,
  FactKind,
  FactPlan,
  FactPlanInput,
  FactTopic,
  FactValue,
  PlanProduct,
  PlanVariant,
  PolicyFacts,
  ShipRow,
  StockMode,
} from './types';
