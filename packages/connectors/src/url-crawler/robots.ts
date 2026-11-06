/** robots.txt theo RFC 9309 (đủ cho nhập chính sách): nhóm User-agent, Allow/Disallow, `*`, `$`, Crawl-delay. */

interface RobotsRule {
  allow: boolean;
  pattern: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelayMs: number | undefined;
}

export interface RobotsRules {
  groups: RobotsGroup[];
  /** Chặn tất cả (khi không đọc được robots.txt: 5xx/lỗi mạng). */
  blockAll: boolean;
}

/** RFC 9309: bộ phân tích phải đọc ít nhất 500 KiB; phần thừa bị bỏ. */
const MAX_ROBOTS_CHARS = 500 * 1024;
const MAX_PATTERN_LENGTH = 512;

export const ROBOTS_ALLOW_ALL: RobotsRules = { groups: [], blockAll: false };
export const ROBOTS_DISALLOW_ALL: RobotsRules = { groups: [], blockAll: true };

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let lastWasAgent = false;
  for (const rawLine of text.slice(0, MAX_ROBOTS_CHARS).split(/\r\n|\r|\n/)) {
    const line = rawLine.split('#', 1)[0]!.trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [], crawlDelayMs: undefined };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      // "Disallow:" rỗng = cho phép tất cả: không cần ghi quy tắc.
      if (value !== '')
        current.rules.push({
          allow: field === 'allow',
          pattern: value.slice(0, MAX_PATTERN_LENGTH),
        });
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0)
        current.crawlDelayMs = Math.round(seconds * 1000);
    }
  }
  return { groups, blockAll: false };
}

/** Nhóm của tên bot (khớp tên chứa trong User-agent, dài nhất thắng); không có thì nhóm `*`. */
function pickGroup(rules: RobotsRules, userAgent: string): RobotsGroup | undefined {
  const name = userAgent.toLowerCase();
  let best: RobotsGroup | undefined;
  let bestLength = 0;
  for (const group of rules.groups) {
    for (const agent of group.agents) {
      if (agent !== '*' && agent !== '' && name.includes(agent) && agent.length > bestLength) {
        best = group;
        bestLength = agent.length;
      }
    }
  }
  return best ?? rules.groups.find((group) => group.agents.includes('*'));
}

/**
 * Khớp mẫu robots với đường dẫn: `*` là chuỗi bất kỳ, `$` ở cuối là hết đường dẫn. Dùng duyệt tham lam có lùi
 * một mức theo từng đoạn giữa các `*` (tuyến tính theo độ dài, không dùng RegExp nên không bị ReDoS).
 */
function matchLength(pattern: string, path: string): number {
  const anchored = pattern.endsWith('$');
  const segments = (anchored ? pattern.slice(0, -1) : pattern).split('*');
  const first = segments[0]!;
  if (!path.startsWith(first)) return -1;
  let position = first.length;
  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const isLast = i === segments.length - 1;
    if (isLast && anchored) {
      if (!path.endsWith(segment) || path.length - segment.length < position) return -1;
      return pattern.length;
    }
    const found = path.indexOf(segment, position);
    if (found < 0) return -1;
    position = found + segment.length;
  }
  if (anchored && position !== path.length) return -1;
  return pattern.length;
}

export function isAllowedByRobots(rules: RobotsRules, userAgent: string, path: string): boolean {
  if (rules.blockAll) return false;
  const group = pickGroup(rules, userAgent);
  if (!group) return true;
  let bestLength = -1;
  let allowed = true;
  for (const rule of group.rules) {
    const length = matchLength(rule.pattern, path);
    if (length >= 0 && (length > bestLength || (length === bestLength && rule.allow))) {
      bestLength = length;
      allowed = rule.allow;
    }
  }
  return allowed;
}

export function crawlDelayFor(rules: RobotsRules, userAgent: string): number | undefined {
  return pickGroup(rules, userAgent)?.crawlDelayMs;
}
