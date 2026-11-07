import { createLlmDepsFromEnv, type LlmDeps, type LlmDepsOptions } from '@flow/ai';

/** Ô Thử AI dùng chung bộ dựng LLM với worker (`createLlmDepsFromEnv`, `@flow/ai`); tên cũ giữ để không đổi nơi gọi. */
export type TryLlmDeps = LlmDeps;
export type TryLlmOptions = LlmDepsOptions;
export const createTryLlmDeps = createLlmDepsFromEnv;
