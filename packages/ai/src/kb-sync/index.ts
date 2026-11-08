// API công khai của module kb-sync (đồng bộ nguồn → đoạn nháp). Thêm export mới ở ĐÂY.
export {
  type ConflictChunk,
  type ConflictGroup,
  type ConflictMember,
  detectConflicts,
} from './conflicts';
export {
  buildPolicyDocuments,
  type PolicyDocument,
  type PolicyInput,
  type Section,
  splitSections,
} from './policy-documents';
export { classifyTopic, type PolicyKind } from './topic';
