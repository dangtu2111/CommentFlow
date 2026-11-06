import type { LlmCaller } from '../cost-gate';
import type { VirtualKeyResolver } from './resolver';

/**
 * `LlmCaller` dùng khóa ảo của đúng workspace (AI-VIRTUALKEY). Ghép bên trong cổng chi phí:
 * `createCostGatedLlmClient(createVirtualKeyLlmCaller(...), …)` — bị chặn thì không cấp khóa/gọi LLM.
 * `makeClient(apiKey)` thường là `createLlmClient({ db, baseUrl, apiKey })`; client được nhớ theo khóa.
 */

export type VirtualKeyLlmCallerOptions = {
  resolver: VirtualKeyResolver;
  makeClient: (apiKey: string) => LlmCaller;
};

export function createVirtualKeyLlmCaller(options: VirtualKeyLlmCallerOptions): LlmCaller {
  const clients = new Map<string, LlmCaller>();
  return {
    async call(input) {
      const apiKey = await options.resolver.resolveKey(input.workspaceId);
      let client = clients.get(apiKey);
      if (!client) {
        client = options.makeClient(apiKey);
        clients.set(apiKey, client);
      }
      return client.call(input);
    },
  };
}
