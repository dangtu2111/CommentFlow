/**
 * Định tuyến model LiteLLM theo bước pipeline (LITELLM-LANGFUSE, FR-034).
 *
 * Mỗi bước dùng một NHÓM model (tên trong `infra/litellm/multi-provider.example.yaml`); LiteLLM tự chọn nhà cung cấp
 * trong nhóm và chuyển sang nhóm dự phòng khi lỗi. Cờ `LITELLM_MULTI_PROVIDER_ENABLED` MẶC ĐỊNH TẮT → mọi bước
 * dùng `mock-llm` (không tốn tiền). Chưa nối vào `llm-client`.
 */
export const MOCK_MODEL = 'mock-llm';

export type StepRoute = { model: string; fallbacks: string[] };

export type RoutingConfig = {
  enabled: boolean;
  routes: Record<string, StepRoute>;
  defaultRoute: StepRoute;
};

export type ResolvedRoute = StepRoute & { source: 'disabled' | 'step' | 'default' };

export const DEFAULT_ROUTING: RoutingConfig = {
  enabled: false,
  routes: {
    classify: { model: 'cf-classify', fallbacks: ['cf-draft'] },
    rewrite: { model: 'cf-classify', fallbacks: ['cf-draft'] },
    draft: { model: 'cf-draft', fallbacks: ['cf-draft-backup'] },
    embed: { model: 'cf-embed', fallbacks: ['cf-embed-backup'] },
  },
  defaultRoute: { model: 'cf-draft', fallbacks: ['cf-draft-backup'] },
};

export function resolveStepRoute(step: string, config: RoutingConfig): ResolvedRoute {
  if (!config.enabled) return { model: MOCK_MODEL, fallbacks: [], source: 'disabled' };
  const own = Object.hasOwn(config.routes, step) ? config.routes[step] : undefined;
  if (own) return { ...own, source: 'step' };
  return { ...config.defaultRoute, source: 'default' };
}
