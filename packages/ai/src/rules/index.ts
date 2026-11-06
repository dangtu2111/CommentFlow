// API công khai của module rules. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  buildPriceQuote,
  type CaptionPriceCheck,
  type CustomerPriceCheck,
  checkCaptionPrices,
  checkCustomerQuotedPrice,
  evaluatePriceRisk,
  extractPriceAmounts,
  type PriceCheckStatus,
  type PriceMention,
  type PriceOwnerAlert,
  type PriceQuote,
  type PriceRisk,
  type QuoteVariant,
} from './price-rules';
