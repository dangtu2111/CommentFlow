// API công khai của module injection. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  annotateInjection,
  describeInjectionReasons,
  INJECTION_REASONS,
  type InjectionAnnotated,
  type InjectionReason,
  type InjectionScanOptions,
  type InjectionScanResult,
  scanInjection,
} from './injection-scan';
