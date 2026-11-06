// API công khai của module variation. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type GuardVariantsInput,
  type GuardVariantsResult,
  guardVariants,
  MAX_VARIANTS,
  type PickedVariant,
  pickVariant,
  REASON_VARIANTS_EXHAUSTED,
  replyFingerprint,
} from './variation';
