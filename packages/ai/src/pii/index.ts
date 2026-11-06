// API công khai của module pii. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type ContactSink,
  fillOrderIntentPhone,
  type MaskAndCaptureInput,
  type MaskAndCaptureResult,
  maskAndCapture,
  maskForTrace,
  PII_SAVE_FAILED,
} from './mask-pipe';
