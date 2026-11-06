/**
 * Điều hướng của khung ứng dụng (docs/08 §3, design/stitch/comments.png). Thuần, không phụ thuộc React/DB để test được
 * và dùng được ở cả Server Component (lọc theo vai trò) lẫn Client Component (đánh dấu mục đang mở).
 *
 * Thanh bên chỉ có MỤC CHÍNH, chia hai nhóm: "Điều hướng vận hành" và "Hệ thống & trí tuệ". Trang con gom vào trang
 * cha (`parent`), URL giữ nguyên: Cơ sở kiến thức có khung `KbFrame`, Bình luận và Cài đặt có thanh tab (`sectionTabsFor`).
 * CHỈ liệt kê trang ĐÃ TỒN TẠI (không tạo liên kết chết): Tin nhắn, Khách tiềm năng, Báo cáo thêm khi trang ra đời.
 * Quyền xem trang vẫn do chính trang kiểm (`requireAppUser`); lọc ở đây chỉ để không hiện liên kết vô ích.
 */
export type NavRole = 'owner' | 'staff';
export type NavGroupKey = 'operations' | 'system';
export type NavItemKey =
  | 'comments'
  | 'posts'
  | 'aiSent'
  | 'kb'
  | 'tryAi'
  | 'readiness'
  | 'automation'
  | 'productImport'
  | 'kbGaps'
  | 'kbPublish'
  | 'kbTestset'
  | 'spamRules'
  | 'channels'
  | 'members'
  | 'activity'
  | 'settings';

export type NavItem = { key: NavItemKey; href: string };
/** Mục chính ở thanh bên; `matchHrefs` = đường dẫn của chính nó và các trang con (để đánh dấu "đang mở"). */
export type NavMainItem = NavItem & { matchHrefs: string[] };
export type NavGroup = { key: NavGroupKey; items: NavMainItem[] };

/** `parent`: trang con gom vào mục cha (không hiện ở thanh bên). */
type Entry = NavItem & { group: NavGroupKey; roles: readonly NavRole[]; parent?: NavItemKey };

const BOTH: readonly NavRole[] = ['owner', 'staff'];
const OWNER: readonly NavRole[] = ['owner'];

const ENTRIES: readonly Entry[] = [
  { key: 'comments', href: '/app/comments', group: 'operations', roles: BOTH },
  // AI đã gửi + Đánh dấu sai (FR-075): Owner và Staff đều xem được (docs/13 §3); tab của Bình luận.
  { key: 'aiSent', href: '/app/ai-sent', group: 'operations', roles: BOTH, parent: 'comments' },
  // Bài viết (FR-060): xem được với mọi vai trò (RLS theo thành viên workspace).
  { key: 'posts', href: '/app/posts', group: 'operations', roles: BOTH },
  // Cơ sở kiến thức (trang trung tâm, QUKP1) + các trang con (khung `KbFrame`); chỉ Owner.
  { key: 'kb', href: '/app/kb', group: 'system', roles: OWNER },
  { key: 'tryAi', href: '/app/try-ai', group: 'system', roles: OWNER, parent: 'kb' },
  { key: 'readiness', href: '/app/readiness', group: 'system', roles: OWNER, parent: 'kb' },
  {
    key: 'productImport',
    href: '/app/products/import',
    group: 'system',
    roles: OWNER,
    parent: 'kb',
  },
  { key: 'kbGaps', href: '/app/kb-gaps', group: 'system', roles: OWNER, parent: 'kb' },
  { key: 'kbPublish', href: '/app/kb-publish', group: 'system', roles: OWNER, parent: 'kb' },
  { key: 'kbTestset', href: '/app/kb-testset', group: 'system', roles: OWNER, parent: 'kb' },
  // Cài đặt tự gửi (FR-070/071): chỉ Owner, Staff nhận 404.
  { key: 'automation', href: '/app/automation', group: 'system', roles: OWNER },
  // Quy tắc spam (FR-080, US-050): chỉ Owner.
  { key: 'spamRules', href: '/app/spam-rules', group: 'system', roles: OWNER },
  // Nhật ký (FR-092): Owner thấy tất cả, Staff chỉ dòng của mình (lọc ở truy vấn `listActionLogs`).
  { key: 'activity', href: '/app/activity', group: 'system', roles: BOTH },
  // Cài đặt (FR-001, FR-119): bảo mật + ngôn ngữ; Kênh (FR-010) và Thành viên chỉ Owner (Staff nhận 404).
  { key: 'settings', href: '/app/settings', group: 'system', roles: BOTH },
  { key: 'channels', href: '/app/channels', group: 'system', roles: OWNER, parent: 'settings' },
  { key: 'members', href: '/app/members', group: 'system', roles: OWNER, parent: 'settings' },
];

/** Mục cha hiện thanh tab ở đầu trang (Cơ sở kiến thức có `KbFrame`, Cài đặt có `SettingsFrame` — cột trái). */
const TAB_SECTIONS: readonly NavItemKey[] = ['comments'];

const GROUP_ORDER: readonly NavGroupKey[] = ['operations', 'system'];

/** Mục đang mở: đúng đường dẫn hoặc trang con (bỏ query/hash, dấu `/` cuối); không khớp tiền tố giả. */
export function isNavActive(pathname: string, href: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0]?.replace(/\/+$/, '') ?? '';
  return path === href || path.startsWith(`${href}/`);
}

/** Đường dẫn của mục và các trang con (lọc theo vai trò nếu có). */
const hrefsOf = (key: NavItemKey, role?: NavRole): string[] =>
  ENTRIES.filter(
    (e) => (e.key === key || e.parent === key) && (!role || e.roles.includes(role)),
  ).map((e) => e.href);

/** Thanh bên: chỉ mục chính (không có `parent`) mà vai trò này dùng được, chia hai nhóm. */
export function navGroupsFor(role: NavRole): NavGroup[] {
  return GROUP_ORDER.map((group) => ({
    key: group,
    items: ENTRIES.filter((e) => e.group === group && !e.parent && e.roles.includes(role)).map(
      ({ key, href }) => ({ key, href, matchHrefs: hrefsOf(key, role) }),
    ),
  })).filter((group) => group.items.length > 0);
}

/**
 * Thanh tab của mục cha chứa `pathname` (Bình luận, Cài đặt): trang cha + các trang con vai trò này xem được.
 * `null` nếu trang không thuộc mục có tab hoặc chỉ còn một tab.
 */
export function sectionTabsFor(role: NavRole, pathname: string): NavItem[] | null {
  const parent = TAB_SECTIONS.find((key) =>
    hrefsOf(key).some((href) => isNavActive(pathname, href)),
  );
  if (!parent) return null;
  const tabs = ENTRIES.filter(
    (e) => (e.key === parent || e.parent === parent) && e.roles.includes(role),
  ).map(({ key, href }) => ({ key, href }));
  return tabs.length > 1 ? tabs : null;
}

/**
 * Trang 403 (docs/08 §7.8): mục vai trò này dùng được và mục chỉ dành cho Owner (khóa với vai trò hiện tại).
 * Lấy từ cùng bảng `ENTRIES` với thanh điều hướng nên không lệch quyền thật.
 */
export function splitNavByRole(role: NavRole): { allowed: NavItem[]; ownerOnly: NavItem[] } {
  const strip = ({ key, href }: Entry): NavItem => ({ key, href });
  const allowed = ENTRIES.filter((e) => e.roles.includes(role)).map(strip);
  const ownerOnly = ENTRIES.filter((e) => !e.roles.includes(role)).map(strip);
  return { allowed, ownerOnly };
}
