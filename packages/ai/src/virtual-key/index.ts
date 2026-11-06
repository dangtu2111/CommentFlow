// API công khai của module virtual-key. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  createLiteLlmKeyAdmin,
  createMockKeyAdmin,
  type KeySpec,
  type LiteLlmKeyAdminOptions,
  type MockKeyAdmin,
  type VirtualKeyAdmin,
} from './admin';
export { createVirtualKeyLlmCaller, type VirtualKeyLlmCallerOptions } from './caller';
export {
  buildKeyAlias,
  computeKeyBudget,
  isVirtualKeysEnabled,
  KEY_ALIAS_PREFIX,
  KEY_BUDGET_DURATION,
  type KeyBudget,
} from './config';
export {
  createVirtualKeyResolver,
  type VirtualKeyResolver,
  type VirtualKeyResolverOptions,
} from './resolver';
export { createMemoryKeyStore, type VirtualKeyRecord, type VirtualKeyStore } from './store';
