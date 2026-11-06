import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTING, MOCK_MODEL, resolveStepRoute } from './routing';

describe('FR-034 định tuyến model theo bước (LiteLLM)', () => {
  it('cờ tắt → mọi bước dùng mock-llm, không dự phòng', () => {
    const route = resolveStepRoute('draft', { ...DEFAULT_ROUTING, enabled: false });
    expect(route).toEqual({ model: MOCK_MODEL, fallbacks: [], source: 'disabled' });
  });

  it('cờ bật → bước có tuyến riêng dùng model + dự phòng của bước', () => {
    const route = resolveStepRoute('classify', { ...DEFAULT_ROUTING, enabled: true });
    expect(route.source).toBe('step');
    expect(route.model).toBe(DEFAULT_ROUTING.routes.classify?.model);
    expect(route.fallbacks.length).toBeGreaterThan(0);
  });

  it('bước lạ → tuyến mặc định', () => {
    const route = resolveStepRoute('buoc-la', { ...DEFAULT_ROUTING, enabled: true });
    expect(route.source).toBe('default');
    expect(route.model).toBe(DEFAULT_ROUTING.defaultRoute.model);
  });

  it('tên bước kiểu prototype (constructor) không lọt vào tuyến', () => {
    const route = resolveStepRoute('constructor', { ...DEFAULT_ROUTING, enabled: true });
    expect(route.source).toBe('default');
  });

  it('không model nào trùng chính model dự phòng của nó', () => {
    const all = [...Object.values(DEFAULT_ROUTING.routes), DEFAULT_ROUTING.defaultRoute];
    for (const r of all) expect(r.fallbacks).not.toContain(r.model);
  });
});
