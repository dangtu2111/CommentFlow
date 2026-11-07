// Provider tùy chỉnh của promptfoo: chạy MỘT mẫu qua pipeline AI (xem src/promptfoo-entry.ts). `tsx` đăng ký trình nạp
// TypeScript để import thẳng mã nguồn của gói (không cần build). Cấu hình qua `providers[].config` trong promptfooconfig.yaml.
import { register } from 'tsx/esm/api';

register();
const { createProvider } = await import('../src/promptfoo-entry.ts');

export default class FlowEvalProvider {
  constructor(options) {
    this.providerId = options?.id ?? 'flow-eval';
    this.entry = createProvider(options?.config ?? {});
  }

  id() {
    return this.providerId;
  }

  async callApi(_prompt, context) {
    return this.entry.call(JSON.parse(context.vars.sample));
  }
}
