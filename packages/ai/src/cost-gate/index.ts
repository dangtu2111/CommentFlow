// API công khai của module cost-gate. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  COST_NEAR_CAP_RATIO,
  type CostGateBlockReason,
  type CostGateDecision,
  type CostGateInput,
  evaluateCostGate,
} from './cost-gate';
export {
  DEFAULT_MAX_OUTPUT_TOKENS,
  estimateCallCostUsd,
  FALLBACK_PRICING,
  type ModelPricing,
  type PricingTable,
} from './estimate';
export {
  type CostGatedClientOptions,
  createCostGatedLlmClient,
  type LlmCaller,
} from './gated-llm-client';
export {
  type CostLedger,
  type CostSnapshot,
  createDbCostLedger,
  createMemoryCostLedger,
  type MemoryCostLedger,
  monthStartUtc,
} from './ledger';
export { createReservationBook, type ReservationBook } from './reservations';
