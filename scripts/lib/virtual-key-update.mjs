// Dựng lệnh cập nhật khóa ảo LiteLLM trên máy ảo cf-dev (xem infra/scripts/cf-dev-update-virtual-key.py).
// Chỉ nhận MÃ BĂM của khóa (không bao giờ truyền khóa thật qua dòng lệnh/ssh) và danh sách model đã kiểm regex.
import { createHash } from 'node:crypto';

export const DEFAULT_MODELS = ['cf-classify', 'cf-draft'];
export const DEFAULT_MAX_BUDGET = 10;
export const DEFAULT_DURATION = '30d';
const CONTAINER = 'cf-dev-litellm-1';
const MODEL = /^[A-Za-z0-9_.-]{1,64}$/;
const DURATION = /^[0-9]{1,4}[smhd]$/;

export class VirtualKeyError extends Error {}

/** SHA-256 hex của khóa — cách LiteLLM nhận diện khóa ảo. Không in/log khóa. */
export function hashVirtualKey(key) {
  const trimmed = String(key ?? '').trim();
  if (trimmed === '') throw new VirtualKeyError('Thiếu LITELLM_API_KEY trong môi trường.');
  return createHash('sha256').update(trimmed).digest('hex');
}

export function buildRemoteCommand({
  keyHash,
  models = DEFAULT_MODELS,
  maxBudget = DEFAULT_MAX_BUDGET,
  duration = DEFAULT_DURATION,
}) {
  if (!/^[0-9a-f]{64}$/.test(keyHash)) throw new VirtualKeyError('Mã băm khóa không hợp lệ.');
  if (models.length === 0) throw new VirtualKeyError('Cần ít nhất một model.');
  for (const model of models) {
    if (!MODEL.test(model)) throw new VirtualKeyError(`Tên model không hợp lệ: ${model}`);
  }
  if (!Number.isFinite(maxBudget) || maxBudget <= 0)
    throw new VirtualKeyError('max-budget phải > 0.');
  if (!DURATION.test(duration)) throw new VirtualKeyError('duration dạng 30d, 12h…');
  return `docker exec -i ${CONTAINER} python - ${keyHash} ${models.join(' ')} --max-budget ${maxBudget} --duration ${duration}`;
}
